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
        page.on('pageerror', error => { errors.push(error.message); console.error('Page error:', error.message); });
        await page.exposeFunction('testEndgamePosition', value => {
            const ChessModule = require(path.join(root, 'assets/node_modules/chess.js'));
            const Chess = ChessModule.Chess || ChessModule;
            const [fen, text = ''] = value.split(' moves ');
            const position = new Chess(fen);
            const played = text ? text.split(' ') : [];
            for (const move of played) position.move({from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4]});
            const next = position.moves({verbose: true})[0];
            return {uci: next ? next.from + next.to + (next.promotion || '') : '0000', score: played.length % 2 ? 0 : 500};
        });
        await page.addInitScript(() => {
            if (location.search.includes('real=1')) return;
            window.engineTest = { commands: [], bestDelay: 25, analysisDelay: 5, failNext: false };
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
                    testEndgamePosition(this.position).then(({uci, score}) => {
                        setTimeout(() => { this.emit(`info depth 18 score cp ${score} pv ${uci}`); this.emit(`bestmove ${uci}`); }, analysing ? engineTest.analysisDelay : engineTest.bestDelay);
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
        assert(await page.locator('#endgame_finish').isDisabled());
        await move('d6', 'c6');
        await page.waitForFunction(() => chess.history().length === 2).catch(async error => { console.error(await page.evaluate(() => ({history: chess.history(), fen: chess.fen(), color, turn: ground.state.turnColor, movable: ground.state.movable.color, commands: engineTest.commands, error: document.getElementById('error_text').textContent}))); throw error; });
        assert.equal(await page.evaluate(() => engineTest.commands.filter(command => command.includes(' depth ')).length), 0);
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
        await page.waitForFunction(() => chess.history().length === 2 && document.getElementById('info_text').textContent.includes('advantage'));
        assert(await page.locator('#endgame_review').isHidden());
        assert.equal((await page.locator('#chessground').boundingBox()).y, top);
        await page.reload();
        await page.waitForFunction(() => window.chess && window.ground);
        assert(await page.locator('#endgame_live_feedback').isChecked());

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

        await page.evaluate(() => { target_result = 'p'; main('7k/P7/6K1/8/8/8/8/8 w - - 0 1'); });
        await move('a7', 'a8');
        assert(await page.locator('[data-promotion-picker]').isVisible());
        assert.equal(await page.evaluate(() => chess.history().length), 0);
        await page.locator('[data-promotion="n"]').click();
        assert.equal(await page.evaluate(() => chess.history({verbose: true})[0].promotion), 'n');
        assert(await page.locator('#next').isVisible());
        await page.locator('#endgame_finish').click();
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
        assert((await page.locator('#success_text').textContent()).includes('Success'));

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
            await page.locator('#endgame_finish').click();
            await page.waitForFunction(() => document.getElementById('endgame_review_status').textContent.startsWith('1 / 1'));
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Review overflows at ${width}`);
            await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            await page.screenshot({path: `/tmp/listudy-endgame-review-${width}-dark.png`, fullPage: true});
        }
        await page.setViewportSize({width: 1366, height: 900});
        await page.evaluate(() => localStorage.setItem('achievements_endgames_solved', '0'));
        await visit('/?real=1');
        await page.locator('#endgame_live_feedback').uncheck();
        await move('d6', 'c6');
        await page.waitForFunction(() => chess.history().length === 2, {timeout: 30000});
        await page.locator('#endgame_hint').click();
        await page.waitForFunction(() => ground.state.drawable.autoShapes.length === 1, {timeout: 30000});
        await page.locator('#endgame_finish').click();
        await page.waitForFunction(() => document.getElementById('endgame_review_status').textContent.startsWith('1 / 1'), {timeout: 30000});
        await page.screenshot({path: '/tmp/listudy-endgame-review-real.png', fullPage: true});
        assert.deepEqual(errors, []);
        console.log('Optional endgame feedback, shared move grades, review/retry/resume, promotion, goals, stale replies, engine failure, responsive layouts and real Stockfish passed');
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
