const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const preview = path.join(process.env.LISTUDY_JOURNEY_PREVIEW || '/tmp/listudy-journey-preview', 'endgame-play.html');
(async () => {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(fs.readFileSync(preview)); return; }
        const file = path.resolve(root, 'priv/static', '.' + url.pathname);
        if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.statusCode = 404; response.end(); return; }
        response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
        const page = await browser.newPage({viewport: {width: 1366, height: 900}});
        const errors = [];
        let tablebaseMode = 'offline', tablebaseRequests = 0, suppliedMove;
        await page.route('https://tablebase.lichess.org/**', async route => {
            if (tablebaseMode === 'offline') return route.fulfill({status: 503, headers: {'Access-Control-Allow-Origin': '*'}, body: ''});
            tablebaseRequests++;
            const ChessModule = require(path.join(root, 'assets/node_modules/chess.js'));
            const Position = ChessModule.Chess || ChessModule;
            const position = new Position(new URL(route.request().url()).searchParams.get('fen'));
            const preserving = tablebaseMode === 'preserved' && position.turn() === 'w';
            const moves = position.moves({verbose: true}).map((move, index) => ({uci: move.from + move.to + (move.promotion || ''), category: preserving ? 'loss' : 'win', dtm: index + 2}));
            suppliedMove = moves[moves.length - 1].uci;
            if (tablebaseMode === 'delayed') await new Promise(resolve => setTimeout(resolve, 150));
            return route.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify({category: preserving ? 'win' : 'loss', moves})});
        });
        page.on('pageerror', error => { errors.push(error.message); console.error('Page error:', error.message); });
        await page.exposeFunction('testEndgamePosition', value => {
            const ChessModule = require(path.join(root, 'assets/node_modules/chess.js'));
            const Chess = ChessModule.Chess || ChessModule;
            const [fen, text = ''] = value.split(' moves ');
            const position = new Chess(fen);
            const played = text ? text.split(' ') : [];
            for (const move of played) position.move({from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4]});
            const next = position.moves({verbose: true})[0];
            return {uci: next ? next.from + next.to + (next.promotion || '') : '0000', score: played.length % 2 ? 0 : 500, turn: position.turn()};
        });
        await page.addInitScript(() => {
            if (location.search.includes('real=1')) return;
            window.engineTest = { commands: [], bestDelay: 25, analysisDelay: 5, failNext: false, mateScore: null };
            window.Worker = class {
                constructor() { this.dead = false; }
                terminate() { this.dead = true; }
                emit(data) { if (!this.dead) this.onmessage?.({data}); }
                postMessage(command) {
                    engineTest.commands.push(command);
                    if (command === 'uci') return setTimeout(() => this.emit('uciok'), 0);
                    if (command === 'isready') return setTimeout(() => this.emit('readyok'), 0);
                    if (command.startsWith('position fen ')) { this.position = command.slice(13); return; }
                    if (!command.startsWith('go')) return;
                    const analysing = command.includes(' depth ');
                    if (engineTest.failNext && !analysing) { engineTest.failNext = false; return setTimeout(() => { if (!this.dead) this.onerror?.(new Error('Unavailable')); }, 5); }
                    testEndgamePosition(this.position).then(({uci, score, turn}) => {
                        const scoreText = analysing && engineTest.mateScore !== null ? `mate ${engineTest.mateScore * (turn === 'w' ? -1 : 1)}` : `cp ${score}`;
                        setTimeout(() => { this.emit(`info depth 18 score ${scoreText} pv ${uci}`); this.emit(`bestmove ${uci}`); }, analysing ? engineTest.analysisDelay : engineTest.bestDelay);
                    });
                }
            };
        });
        const base = `http://127.0.0.1:${server.address().port}`;
        const visit = async suffix => {
            await page.goto(base + (suffix || '/'));
            await page.waitForFunction(() => window.chess && window.ground && !document.getElementById('endgame_hint').disabled);
        };
        const move = async (from, to) => page.evaluate(([from, to]) => { ground.selectSquare(from); ground.selectSquare(to); }, [from, to]);
        await visit();
        assert.equal(await page.locator('#endgame_live_feedback').isChecked(), false);
        assert(await page.locator('#endgame_eval_bar').isHidden());
        assert(await page.locator('#endgame_undo').isDisabled());
        await page.locator('#endgame_eval_toggle').check();
        await page.waitForFunction(() => document.querySelector('#endgame_eval_bar span').textContent === '+5.0');
        assert.equal(await page.locator('#endgame_eval_bar span').textContent(), '+5.0');
        assert.equal(await page.locator('#endgame_live_feedback').isChecked(), false, 'Evaluation bar is independent of move feedback');
        await page.reload();
        await page.waitForFunction(() => window.chess && window.ground);
        assert(await page.locator('#endgame_eval_toggle').isChecked(), 'Evaluation preference persists');
        await page.locator('#endgame_eval_toggle').uncheck();
        assert(await page.locator('#endgame_finish').isDisabled());
        const initialSearches = await page.evaluate(() => engineTest.commands.filter(command => command.includes(' depth ')).length);
        await move('d6', 'c6');
        await page.waitForFunction(() => chess.history().length === 2).catch(async error => { console.error(await page.evaluate(() => ({history: chess.history(), fen: chess.fen(), color, turn: ground.state.turnColor, movable: ground.state.movable.color, commands: engineTest.commands, error: document.getElementById('error_text').textContent}))); throw error; });
        assert.equal(await page.evaluate(() => engineTest.commands.filter(command => command.includes(' depth ')).length), initialSearches);
        await page.locator('#endgame_finish').click();
        await page.waitForFunction(() => document.getElementById('endgame_review_status').textContent.startsWith('1 / 1'));
        assert.equal(await page.locator('#endgame_review_moves .study-tree-move').count(), 3);
        assert.equal(await page.locator('.endgame-key-move').count(), 1);
        assert.equal(await page.locator('.endgame-key-move').getAttribute('data-grade-symbol'), '??');
        assert((await page.locator('#endgame_review_comment').textContent()).includes('Kc6'));
        assert(!(await page.locator('#endgame_review_comment').textContent()).includes('No clear change'));
        assert((await page.locator('#endgame_review_line').textContent()).includes('Suggested continuation:'));
        assert.equal(await page.evaluate(() => ground.state.drawable.autoShapes.length), 1);
        await page.screenshot({path: '/tmp/listudy-endgame-review-1366.png', fullPage: true});
        await page.locator('#endgame_retry').click();
        assert.equal(await page.evaluate(() => chess.history().length), 0);
        assert(await page.locator('#endgame_review').isHidden());

        await page.locator('#endgame_live_feedback').check();
        const top = (await page.locator('#chessground').boundingBox()).y;
        await move('d6', 'c6');
        await page.waitForFunction(() => chess.history().length === 2 && document.getElementById('endgame_live_comment').textContent.includes('advantage'));
        assert(await page.locator('#endgame_review').isHidden());
        assert(await page.locator('#info').isHidden(), 'Outcome feedback does not repeat in a native alert');
        assert.equal((await page.locator('#chessground').boundingBox()).y, top);
        const assessment = page.locator('#endgame_live_assessment');
        assert(await assessment.isVisible());
        const assessmentText = await assessment.textContent();
        await page.waitForTimeout(4300);
        assert(await assessment.isVisible(), 'Feedback survives the quick engine reply and toast expiry');
        assert.equal(await assessment.textContent(), assessmentText);
        await page.locator('#endgame_hint').click();
        await page.waitForFunction(() => !document.getElementById('info').classList.contains('hidden') && ground.state.drawable.autoShapes.length > 0);
        await page.waitForTimeout(100);
        const notice = await page.locator('#info').boundingBox();
        for (const selector of ['#endgame_live_assessment', '#endgame_live_comment', '.endgame-goal-heading']) {
            const box = await page.locator(selector).boundingBox();
            assert(!box || notice.x + notice.width <= box.x || box.x + box.width <= notice.x || notice.y + notice.height <= box.y || box.y + box.height <= notice.y, `Hint alert overlaps ${selector}`);
        }
        await assessment.click();
        assert(await page.locator('#endgame_review').isVisible());
        await page.locator('#endgame_resume').click();
        await page.reload();
        await page.waitForFunction(() => window.chess && window.ground);
        assert(await page.locator('#endgame_live_feedback').isChecked());

        await move('d6', 'c6');
        await page.waitForFunction(() => chess.history().length === 2);
        await page.waitForFunction(() => !document.getElementById('endgame_live_assessment').hidden);
        const previousAssessment = await page.locator('#endgame_live_assessment').textContent();
        const previousFen = await page.evaluate(() => chess.fen());
        const secondMove = await page.evaluate(() => { const move = chess.moves({verbose: true})[0]; return [move.from, move.to]; });
        await move(...secondMove);
        await page.waitForFunction(() => chess.history().length === 4);
        await page.locator('#endgame_undo').click();
        assert.equal(await page.evaluate(() => chess.history().length), 2, 'Undo preserves earlier decisions');
        assert.equal(await page.evaluate(() => chess.fen()), previousFen);
        assert(await page.locator('#endgame_live_assessment').isVisible(), 'Rollback preserves completed feedback immediately');
        assert.equal(await page.locator('#endgame_live_assessment').textContent(), previousAssessment);
        await page.locator('#endgame_undo').click();
        assert.equal(await page.evaluate(() => chess.history().length), 0, 'Undo removes player move and engine reply');
        assert(await page.locator('#endgame_undo').isDisabled());
        await page.evaluate(() => { engineTest.bestDelay = 300; main(); });
        await move('d6', 'c6');
        await page.waitForFunction(() => chess.history().length === 1);
        await page.locator('#endgame_undo').click();
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => chess.history().length), 0, 'Undo cancels a pending opponent reply');
        await page.evaluate(() => { engineTest.bestDelay = 300; main(); });
        await move('d6', 'c6');
        await page.locator('#endgame_finish').click();
        await page.locator('#endgame_resume').click();
        await page.waitForFunction(() => chess.history().length === 2);
        assert(await page.locator('#endgame_review').isHidden());
        await page.evaluate(() => { engineTest.bestDelay = 300; main(); });
        await move('d6', 'c6');
        await page.locator('#reset').click();
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => chess.history().length), 0, 'Stale engine reply must not enter a reset game');

        await page.locator('#endgame_eval_toggle').check();
        await page.evaluate(() => { main(); engineTest.analysisDelay = 250; });
        await page.waitForFunction(() => document.querySelector('#endgame_eval_bar span').textContent === '+5.0');
        await move('d6', 'c6');
        await page.waitForFunction(() => chess.history().length >= 1);
        assert.equal(await page.locator('#endgame_eval_bar span').textContent(), '+5.0', 'The previous evaluation remains while the engine thinks');
        assert.equal(await page.locator('#endgame_eval_bar').getAttribute('aria-busy'), 'true');
        await page.evaluate(() => { engineTest.analysisDelay = 5; });
        await page.evaluate(() => { engineTest.mateScore = -6; main(); });
        await page.waitForFunction(() => !document.getElementById('endgame_mate_cue').hidden);
        assert.equal(await page.evaluate(() => chess.history().length), 0, 'Mate is shown before the first player move');
        assert.equal(await page.locator('#endgame_mate_cue').textContent(), 'Mate in 6');
        await move('d6', 'c6');
        await page.waitForFunction(() => document.querySelector('.endgame-mate-cue')?.textContent === 'Mate in 6');
        assert.equal(await page.locator('.endgame-mate-cue').getAttribute('data-winning'), 'true');
        assert.equal(await page.locator('#endgame_live_assessment .endgame-mate-cue').count(), 0);
        await page.waitForFunction(() => chess.history().length === 2);
        await page.waitForTimeout(4300);
        assert(await page.locator('#endgame_mate_cue').isVisible(), 'Mate indicator stays in its fixed place after the engine reply and toast expiry');
        await page.locator('#endgame_eval_toggle').check();
        await page.waitForFunction(() => document.querySelector('#endgame_eval_bar span').textContent === 'M6');
        const rail = await page.locator('#endgame_eval_bar').boundingBox();
        const board = await page.locator('cg-board').boundingBox();
        assert(Math.abs(rail.height - board.height) < 1, 'Evaluation rail matches the rendered board height');
        await page.screenshot({path: '/tmp/listudy-endgame-live-mate.png', fullPage: true});
        await page.evaluate(() => { main(); engineTest.mateScore = 6; });
        await move('d6', 'c6');
        await page.waitForFunction(() => document.querySelector('.endgame-mate-cue')?.textContent === 'Opponent has mate in 6');
        assert.equal(await page.locator('.endgame-mate-cue').getAttribute('data-winning'), 'false');
        await page.evaluate(() => { engineTest.mateScore = null; });
        await page.locator('#endgame_live_feedback').uncheck();
        await page.locator('#endgame_eval_toggle').uncheck();
        assert(await page.locator('#endgame_live_assessment').isHidden());
        await page.evaluate(() => { target_result = 'p'; main('7k/P7/6K1/8/8/8/8/8 w - - 0 1'); });
        await move('a7', 'a8');
        assert(await page.locator('[data-promotion-picker]').isVisible());
        assert.equal(await page.evaluate(() => chess.history().length), 0);
        await page.locator('[data-promotion="n"]').click();
        assert.equal(await page.evaluate(() => chess.history({verbose: true})[0].promotion), 'n');
        assert(await page.locator('#next').isVisible());
        assert(await page.locator('#endgame_review').isVisible());
        assert(await page.locator('#endgame_resume').isHidden());
        await page.waitForFunction(() => document.getElementById('endgame_review_status').textContent.startsWith('1 / 1'));
        assert.equal(await page.locator('.endgame-key-move').count(), 0, 'Completing the promotion goal is not an error');

        await page.evaluate(() => { target_result = 'w'; main('7k/5K2/6Q1/8/8/8/8/8 w - - 0 1'); });
        await move('g6', 'g7');
        await page.waitForFunction(() => chess.in_checkmate());
        assert(await page.locator('#next').isVisible());
        assert.equal(await page.locator('#endgame_finish').textContent(), 'Review exercise');
        await page.evaluate(() => { target_result = 'd'; main('7k/8/5KQ1/8/8/8/8/8 w - - 0 1'); });
        await move('g6', 'f7');
        await page.waitForFunction(() => chess.in_draw());
        assert.equal(await page.locator('#todo').getAttribute('data-result'), 'success');
        assert(await page.locator('#endgame_review').isVisible());
        assert.equal(await page.evaluate(() => ground.getFen()), await page.evaluate(() => chess.fen().split(' ')[0]));

        await page.evaluate(() => { target_result = 'w'; main(); engineTest.failNext = true; });
        await move('d6', 'c6');
        await page.waitForFunction(() => document.getElementById('error_text').textContent.includes('unavailable'));
        await page.locator('#reset').click();
        assert.equal(await page.evaluate(() => chess.history().length), 0);
        for (const width of [320, 390, 1366]) {
            await page.setViewportSize({width, height: 844});
            await page.evaluate(() => main());
            await move('d6', 'c6');
            await page.waitForFunction(() => chess.history().length === 2);
            await page.locator('#endgame_eval_toggle').check();
            await page.locator('#endgame_finish').click();
            await page.waitForFunction(() => document.getElementById('endgame_review_status').textContent.startsWith('1 / 1'));
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Review overflows at ${width}`);
            await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            const popup = page.locator('.popup:visible').first();
            if (await popup.count()) assert.equal(await popup.evaluate(element => getComputedStyle(element).position), 'static', 'Native achievements do not float over training controls');
            await page.screenshot({path: `/tmp/listudy-endgame-review-${width}-dark.png`, fullPage: true});
        }
        await page.setViewportSize({width: 1366, height: 900});
        await page.evaluate(() => localStorage.setItem('achievements_endgames_solved', '0'));
        await visit('/?real=1');
        await page.locator('#endgame_live_feedback').uncheck();
        await move('d6', 'c6');
        await page.waitForFunction(() => chess.history().length === 2, {timeout: 30000});
        await page.locator('#endgame_eval_toggle').check();
        await page.locator('#endgame_hint').click();
        await page.waitForFunction(() => ground.state.drawable.autoShapes.length === 1, {timeout: 30000});
        await page.locator('#endgame_finish').click();
        await page.waitForFunction(() => document.getElementById('endgame_review_status').textContent.startsWith('1 / 1'), {timeout: 30000});
        await page.screenshot({path: '/tmp/listudy-endgame-review-real.png', fullPage: true});
        await page.evaluate(() => {
            localStorage.setItem('endgame_live_feedback', 'false');
            localStorage.setItem('endgame_eval_bar', 'false');
        });
        tablebaseMode = 'available';
        await visit('/');
        await page.evaluate(() => main('7k/8/8/8/8/5Q2/5K2/8 w - - 0 1'));
        await move('f3', 'f4');
        await page.waitForFunction(() => chess.history().length === 2);
        assert.equal(await page.evaluate(() => { const move = chess.history({verbose: true})[1]; return move.from + move.to; }), suppliedMove);
        assert.equal(await page.evaluate(() => engineTest.commands.filter(command => command.startsWith('go')).length), 0, 'An available tablebase supplies the defence without an opponent search');
        tablebaseMode = 'delayed'; tablebaseRequests = 0;
        await visit('/');
        await page.evaluate(() => main('7k/8/8/8/8/5Q2/5K2/8 w - - 0 1'));
        await move('f3', 'f4');
        for (let attempt = 0; attempt < 100 && !tablebaseRequests; attempt++) await page.waitForTimeout(10);
        assert(tablebaseRequests, 'The opponent requests an eligible tablebase position');
        await page.locator('#endgame_undo').click();
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => chess.history().length), 0, 'A late tablebase reply cannot move after undo');
        tablebaseMode = 'preserved';
        await visit('/');
        await page.evaluate(() => main('7k/8/8/8/8/5Q2/5K2/8 w - - 0 1'));
        await page.locator('#endgame_live_feedback').check();
        await move('f3', 'f4');
        await page.waitForFunction(() => !document.getElementById('endgame_live_assessment').hidden);
        assert.equal(await page.locator('#endgame_live_assessment').getAttribute('data-grade'), 'acceptable', 'An exact preserved win overrides the mock Stockfish evaluation drop');
        assert(await page.locator('#endgame_live_comment').isHidden());
        await page.locator('#endgame_finish').click();
        await page.waitForFunction(() => document.getElementById('endgame_review_status').textContent.startsWith('1 / 1'));
        assert.equal(await page.locator('.endgame-key-move').count(), 0, 'A preserved win does not become a false key mistake in review');
        assert.deepEqual(errors, []);
        console.log('Optional endgame feedback, shared move grades, review/retry/resume, promotion, goals, stale replies, engine failure, responsive layouts and real Stockfish passed');
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
