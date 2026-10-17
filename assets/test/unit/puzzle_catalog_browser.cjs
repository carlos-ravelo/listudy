const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fixtures = process.env.LISTUDY_PUZZLES_PREVIEW || '/tmp/listudy-puzzles-preview';
(async () => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const fixture = ['/catalog', '/promotion'].includes(pathname);
        const file = fixture ? path.join(fixtures, pathname.slice(1) + '.html') : path.resolve(root, 'priv/static', '.' + pathname);
        if ((!fixture && !file.startsWith(root + '/priv/static/')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {response.statusCode = 404; response.end(); return;}
        response.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
        const page = await browser.newPage({viewport: {width: 1366, height: 900}});
        const errors = [], external = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => {if (/https?:\/\/[^/]*lichess/.test(request.url())) external.push(request.url());});
        const base = `http://127.0.0.1:${server.address().port}`;
        const visit = async route => {await page.goto(base + route); await page.waitForFunction(() => window.chess && window.ground);};
        const move = async (from, to) => page.evaluate(([from, to]) => {ground.selectSquare(from); ground.selectSquare(to);}, [from, to]);
        await visit('/catalog');
        assert.equal(await page.evaluate(() => chess.turn()), 'w');
        assert.equal(await page.evaluate(() => chess.get('d7').type), 'k');
        await move('a2', 'e6');
        await page.waitForFunction(() => chess.history().length === 2);
        await move('f7', 'f8');
        await page.waitForFunction(() => chess.in_checkmate());
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('puzzle_progress_v1:lichess:browser')).cleanSolves), 1);
        assert(await page.locator('#next').isVisible());
        await visit('/promotion');
        await move('a7', 'a8');
        assert(await page.locator('[data-promotion-picker]').isVisible());
        await page.locator('[data-promotion="n"]').click();
        await page.waitForFunction(() => chess.get('a8')?.type === 'n');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('puzzle_progress_v1:lichess:promotion')).solves), 1);
        assert.deepEqual(external, []);
        assert.deepEqual(errors, []);
        console.log('Puzzle catalog browser: passed');
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {console.error(error); process.exit(1);});
