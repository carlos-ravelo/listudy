const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fixtures = process.env.LISTUDY_NATIVE_PREVIEW || '/tmp/listudy-native-preview';
(async () => {
    const pages = {'/daily': 'daily', '/blind': 'blind', '/blind-sequence': 'blind-sequence', '/pieceless': 'pieceless-mate', '/capture': 'pieceless-capture', '/promotion': 'pieceless-promotion', '/fallback': 'pieceless-fallback'};
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const file = pages[url.pathname] ? path.join(fixtures, pages[url.pathname] + '.html') : path.resolve(root, 'priv/static', '.' + url.pathname);
        if ((!pages[url.pathname] && !file.startsWith(root + '/priv/static/')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {response.statusCode = 404; response.end(); return;}
        response.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
        const page = await browser.newPage({viewport: {width: 1366, height: 768}});
        const errors = [];
        page.on('pageerror', error => {errors.push(error.message); console.error(error.stack);});
        const visit = async route => {await page.goto(`http://127.0.0.1:${server.address().port}${route}`); await page.waitForFunction(() => window.ground && window.chess);};
        const move = async (from, to) => page.evaluate(([from, to]) => {ground.selectSquare(from); ground.selectSquare(to);}, [from, to]);
        const records = mode => page.evaluate(mode => Object.values(JSON.parse(localStorage.getItem(`native_visualization_v1:${mode}`)).runs), mode);
        await visit('/daily');
        assert.equal(await page.locator('#next').getAttribute('href'), '/en/tactics');
        assert.equal(await page.locator('a[href="/en/tactics/random"]').count(), 0);
        await page.locator('#info .close_button').focus();
        await page.keyboard.press('Enter');
        assert(await page.locator('#info').isHidden(), 'Native feedback can be dismissed using the keyboard');
        await visit('/blind');
        assert.equal(await page.evaluate(() => ground.getFen()), '7k/5K2/6Q1/8/8/8/8/8');
        await page.locator('.training-settings summary').click();
        await page.locator('#ply_select').fill('50');
        await page.locator('#ply_select').dispatchEvent('change');
        assert.equal(await page.locator('#ply_select').inputValue(), '20');
        assert.equal(await page.evaluate(() => hidden_moves), 0, 'Changing the next-puzzle setting must not alter the current frozen board');
        await page.evaluate(() => document.dispatchEvent(new Event('phx:update')));
        assert.equal(await page.evaluate(() => current_move), 0);
        await move('g6', 'g7');
        await page.waitForFunction(() => !document.getElementById('next').classList.contains('hidden'));
        assert(await page.evaluate(() => current_chess.in_checkmate()));
        const solves = await page.evaluate(() => localStorage.getItem('achievements_blind_tactics_solved'));
        await move('g7', 'g8');
        assert.equal(await page.evaluate(() => localStorage.getItem('achievements_blind_tactics_solved')), solves, 'Completed puzzles do not accept more answers');
        await page.locator('#training_restart').click();
        assert.equal(await page.evaluate(() => current_move), 0);
        await page.locator('#give-up').click();
        assert(await page.evaluate(() => current_chess.in_checkmate()));
        let blindRuns = await records('blind');
        assert.equal(blindRuns.filter(run => run.completed && !run.assisted && !run.errors).length, 1);
        assert(blindRuns.some(run => run.revealed && run.assisted && run.rehearsed));
        await visit('/blind-sequence');
        await page.locator('.training-settings summary').click();
        await page.locator('[data-visualization-difficulty]').selectOption('auto');
        await page.locator('#training_restart').click();
        assert.equal(await page.evaluate(() => hidden_moves), 1);
        await page.evaluate(() => ground.selectSquare('g1'));
        assert.equal(await page.evaluate(() => ground.state.drawable.shapes.length), 0, 'Strict training does not reveal legal destinations');
        await page.evaluate(() => ground.selectSquare('g3'));
        blindRuns = await records('blind');
        if (blindRuns.at(-1).errors !== 1) console.error(await page.evaluate(() => ({clicked: window.clicked_piece, current_move, history: current_chess.history(), legal: [...legal_moves], info: document.getElementById('info').textContent, error: document.getElementById('error').textContent})));
        assert.equal(blindRuns.at(-1).errors, 1, 'Wrong imagined destinations count as errors even when illegal');
        await page.locator('[data-visualization-destinations]').check();
        await page.evaluate(() => ground.selectSquare('g1'));
        await page.waitForFunction(() => ground.state.drawable.shapes.length > 0);
        await move('g1', 'f3'); await move('f1', 'b5');
        await page.waitForFunction(() => !document.getElementById('next').classList.contains('hidden'));
        blindRuns = await records('blind');
        assert(blindRuns.at(-1).completed && blindRuns.at(-1).assisted && blindRuns.at(-1).errors === 1);
        await page.reload(); await page.waitForFunction(() => window.ground && window.chess);
        assert(await page.locator('[data-visualization-destinations]').isChecked(), 'Assistance preference persists');
        await visit('/pieceless');
        assert.equal(await page.locator('#info').count(), 1);
        await page.waitForFunction(() => document.querySelectorAll('cg-board piece.visualization-hidden-piece').length === 1);
        assert.equal(await page.evaluate(() => ground.state.movable.showDests), false);
        assert.equal(await page.locator('cg-board piece.visualization-hidden-piece').evaluate(element => getComputedStyle(element).visibility), 'hidden');
        await move('g6', 'g7');
        await page.waitForFunction(() => chess.in_checkmate());
        assert(await page.locator('.pieceless-workspace').evaluate(element => element.classList.contains('training-revealed')));
        assert.equal(await page.evaluate(() => ground.state.movable.color), undefined);
        await page.locator('#training_restart').click();
        assert.equal(await page.evaluate(() => chess.history().length), 0);
        await page.locator('#give-up').click();
        assert(await page.evaluate(() => chess.in_checkmate()));
        let pieceRuns = await records('pieceless');
        assert.equal(pieceRuns.filter(run => run.completed && !run.assisted && !run.errors).length, 1);
        assert(pieceRuns.at(-1).revealed && pieceRuns.at(-1).assisted);
        await visit('/capture');
        await move('a1', 'a8');
        await page.waitForFunction(() => chess.history().length === 2);
        await page.waitForFunction(() => [...document.querySelectorAll('cg-board piece')].some(piece => piece.cgKey === 'a8' && piece.classList.contains('visualization-hidden-piece')));
        await move('a8', 'h8');
        assert((await records('pieceless')).at(-1).completed);
        await page.locator('.training-settings summary').click();
        await page.locator('[data-visualization-difficulty]').selectOption('all');
        await page.locator('#training_restart').click();
        assert.equal(await page.locator('cg-board piece').first().evaluate(element => getComputedStyle(element).display), 'none');
        assert.equal((await records('pieceless')).at(-1).hiddenPieces, 6);
        await page.locator('[data-visualization-destinations]').check();
        assert.equal(await page.evaluate(() => ground.state.movable.showDests), true);
        await page.locator('#give-up').click();
        assert((await records('pieceless')).at(-1).assisted);
        await visit('/promotion');
        await move('a7', 'a8');
        await page.waitForSelector('[data-promotion-picker]:not([hidden])');
        await page.locator('[data-promotion="n"]').click();
        assert.equal(await page.evaluate(() => chess.history({verbose: true})[0].promotion), 'n');
        await visit('/fallback');
        assert(await page.locator('#pieceless_pieces .pieceless_piece_container').count());
        await page.locator('#give-up').click();
        assert(await page.locator('#next').isVisible());
        await page.locator('.training-settings summary').click();
        await page.locator('[data-visualization-difficulty]').selectOption('auto');
        // Alternate checkmates solve the exercise in all three native modes.
        await visit('/daily');
        await page.evaluate(() => {
            document.getElementById('fen').value = '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1';
            document.getElementById('moves').value = 'Qg7#';
            document.getElementById('color').value = 'white';
            document.getElementById('last_move').value = '';
            document.dispatchEvent(new Event('phx:update'));
        });
        await move('g6', 'h6');
        await page.waitForFunction(() => chess.in_checkmate());
        assert(await page.locator('#next').isVisible());
        for (const route of ['/blind', '/pieceless']) {
            await visit(route);
            await move('g6', 'h6');
            await page.waitForFunction(() => !document.getElementById('next').classList.contains('hidden'));
            assert(await page.evaluate(() => (typeof current_chess === 'undefined' ? chess : current_chess).in_checkmate()), route + ' accepts another mate');
        }
        await visit('/daily');
        await page.evaluate(() => {
            window.Worker = class {
                postMessage(command) {
                    if (command === 'uci') setTimeout(() => this.onmessage?.({data: 'uciok'}), 0);
                    if (command === 'isready') setTimeout(() => this.onmessage?.({data: 'readyok'}), 0);
                    if (command.startsWith('go')) setTimeout(() => {
                        this.onmessage?.({data: 'info depth 4 score cp 0 pv e7e5'});
                        this.onmessage?.({data: 'bestmove e7e5'});
                    }, 20);
                }
                terminate() { this.onmessage = null; }
            };
            document.getElementById('fen').value = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            document.getElementById('moves').value = 'e4 e5 Nf3';
            document.getElementById('color').value = 'white';
            document.getElementById('last_move').value = '';
            document.dispatchEvent(new Event('phx:update'));
        });
        await move('d2', 'd4');
        await page.waitForFunction(() => document.getElementById('info').textContent.includes('Could not verify'));
        assert.equal(await page.evaluate(() => chess.history().length), 0, 'Uncertain alternative restores the original position');
        assert(await page.locator('#error').isHidden(), 'Insufficient search is not labelled a wrong move');
        await move('e2', 'e4');
        await page.waitForFunction(() => chess.history().length === 2);
        assert.equal(await page.evaluate(() => chess.history().join(' ')), 'e4 e5', 'Authored continuation remains usable after inconclusive validation');
        for (const width of [320, 390, 1366]) {
            await page.setViewportSize({width, height: 844});
            for (const route of ['/daily', '/blind', '/pieceless']) {
                await visit(route);
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
                const dimensions = await page.waitForFunction(() => {
                    const rect = document.querySelector('cg-board')?.getBoundingClientRect();
                    return rect?.width > 0 ? {width: rect.width, height: rect.height} : null;
                });
                const box = await dimensions.jsonValue();
                assert(Math.abs(box.width - box.height) < 1);
                await page.waitForTimeout(250);
                for (const theme of ['light', 'dark']) {
                    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
                    await page.screenshot({path: `/tmp/listudy-native-${route.slice(1)}-${width}-${theme}.png`, fullPage: true});
                }
            }
        }
        assert.deepEqual(errors, []);
        console.log('Native visualization progress, strict play, adaptive masks, retry accounting and native training flows passed at 320/390/1366px');
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {console.error(error); process.exitCode = 1;});
