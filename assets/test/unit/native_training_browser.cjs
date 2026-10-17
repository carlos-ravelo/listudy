const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fixtures = process.env.LISTUDY_NATIVE_PREVIEW || '/tmp/listudy-native-preview';
(async () => {
    const pages = {'/daily': 'daily', '/blind': 'blind', '/pieceless': 'pieceless-mate', '/promotion': 'pieceless-promotion', '/fallback': 'pieceless-fallback'};
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
        page.on('pageerror', error => {errors.push(error.message); console.error(error.message);});
        const visit = async route => {await page.goto(`http://127.0.0.1:${server.address().port}${route}`); await page.waitForFunction(() => window.ground && window.chess);};
        const move = async (from, to) => page.evaluate(([from, to]) => {ground.selectSquare(from); ground.selectSquare(to);}, [from, to]);
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
        await visit('/pieceless');
        assert.equal(await page.locator('#info').count(), 1);
        assert.equal(await page.locator('cg-board piece').first().evaluate(element => getComputedStyle(element).display), 'none');
        await move('g6', 'g7');
        await page.waitForFunction(() => chess.in_checkmate());
        assert(await page.locator('.pieceless-workspace').evaluate(element => element.classList.contains('training-revealed')));
        assert.equal(await page.evaluate(() => ground.state.movable.color), undefined);
        await page.locator('#training_restart').click();
        assert.equal(await page.evaluate(() => chess.history().length), 0);
        await page.locator('#give-up').click();
        assert(await page.evaluate(() => chess.in_checkmate()));
        await visit('/promotion');
        await move('a7', 'a8');
        await page.waitForSelector('[data-promotion-picker]:not([hidden])');
        await page.locator('[data-promotion="n"]').click();
        assert.equal(await page.evaluate(() => chess.history({verbose: true})[0].promotion), 'n');
        await visit('/fallback');
        assert(await page.locator('#pieceless_pieces .pieceless_piece_container').count());
        await page.locator('#give-up').click();
        assert(await page.locator('#next').isVisible());
        for (const width of [320, 390, 1366]) {
            await page.setViewportSize({width, height: 844});
            for (const route of ['/daily', '/blind', '/pieceless']) {
                await visit(route);
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
                const box = await page.locator('cg-board').boundingBox();
                assert(Math.abs(box.width - box.height) < 1);
                await page.waitForTimeout(250);
                for (const theme of ['light', 'dark']) {
                    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
                    await page.screenshot({path: `/tmp/listudy-native-${route.slice(1)}-${width}-${theme}.png`, fullPage: true});
                }
            }
        }
        assert.deepEqual(errors, []);
        console.log('Daily return links, blind custom FEN, stable hidden moves, retry, solved-state locks, pieceless fallback, reveal and underpromotion passed at 320/390/1366px');
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {console.error(error); process.exitCode = 1;});
