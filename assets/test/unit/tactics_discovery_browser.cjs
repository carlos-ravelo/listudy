const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fixtures = process.env.LISTUDY_DISCOVERY_PREVIEW || '/tmp/listudy-discovery-preview';
(async () => {
    const pages = {'/en/tactics': 'library', '/en/features/blind-tactics': 'blind-tactics', '/en/features/pieceless-tactics': 'pieceless-tactics', '/en/tactics/custom': 'custom', '/en/webmaster': 'webmaster', '/en/webmaster/custom-tactics': 'embed', '/en/iframe/custom-tactic': 'iframe'};
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const native = {'/en/blind-tactics': 'blind', '/en/pieceless-tactics': 'pieceless-mate'}[url.pathname];
        const file = native ? `/tmp/listudy-native-preview/${native}.html` : pages[url.pathname] ? path.join(fixtures, pages[url.pathname] + '.html') : path.resolve(root, 'priv/static', '.' + url.pathname);
        if ((!native && !pages[url.pathname] && !file.startsWith(root + '/priv/static/')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {response.statusCode = 404; response.end(); return;}
        response.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
        const page = await browser.newPage({viewport: {width: 1366, height: 900}});
        const errors = [];
        page.on('pageerror', error => {errors.push(error.message); console.error(error.stack);});
        const base = `http://127.0.0.1:${server.address().port}`;
        await page.goto(base + '/en/tactics');
        assert.equal(await page.locator('[data-nav-section=practice]').count(), 0);
        assert.equal(await page.locator('.tactics-modes').evaluate(el => getComputedStyle(el).fontVariant), 'normal', 'Mode links retain readable text rather than inherited small caps');
        for (const mode of ['blind-tactics', 'pieceless-tactics']) {
            await page.locator(`.tactics-modes a[href='/en/${mode}']`).click();
            await page.waitForFunction(() => window.ground && window.chess);
            assert.equal(await page.locator('a[data-nav-section=tactics]').getAttribute('aria-current'), 'location');
            await page.locator('.training-breadcrumb a').click();
            await page.waitForSelector('.tactics-modes');
            await page.goto(base + '/en/features/' + mode);
            assert((await page.locator('.training-actions a.button').boundingBox()).width < 500, 'Training action stays compact');
            const help = page.locator('.training-help');
            assert.equal(await help.getAttribute('open'), null);
            await help.locator('summary').focus(); await page.keyboard.press('Enter');
            assert.notEqual(await help.getAttribute('open'), null);
            await page.locator(`.training-actions a[href='/en/${mode}']`).click();
            await page.waitForFunction(() => window.ground && window.chess);
            await page.locator('.training-breadcrumb a').click();
        }
        await page.goto(base + '/en/tactics/custom#own');
        assert(await page.locator('.custom-tactic-preview').isHidden());
        assert.notEqual(await page.locator('#fen_input').evaluate(el => getComputedStyle(el).borderColor), 'rgb(255, 0, 0)', 'An untouched required field is not an error');
        await page.locator('#fen_input').fill('7k/5K2/6Q1/8/8/8/8/8 w - - 0 1');
        await page.locator('#moves_input').fill('Qg7#');
        await page.locator('#create_button').click();
        await page.waitForFunction(() => window.chess && window.ground && !document.querySelector('.custom-tactic-preview').hidden);
        assert.equal(await page.locator('#last_move_input').inputValue(), '', 'Last move remains optional');
        assert.equal(await page.locator('#moves_input').inputValue(), 'Qg7#', 'Created puzzles remain editable');
        await page.locator('#custom_embed_tools summary').click();
        assert((await page.locator('#iframe_code').inputValue()).includes('/en/iframe/custom-tactic#'));
        await page.evaluate(() => {ground.selectSquare('g6'); ground.selectSquare('g7');});
        await page.waitForFunction(() => chess.in_checkmate());
        assert(await page.locator('#next').isVisible());
        for (const width of [320, 1366]) {
            await page.setViewportSize({width, height: 900});
            for (const [route, name] of Object.entries(pages).filter(([,name]) => name !== 'iframe')) {
                await page.goto(base + route);
                await page.waitForSelector('main h1');
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
                assert.equal(await page.locator('a button').count(), 0);
                for (const theme of ['light', 'dark']) {
                    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
                    await page.screenshot({path: `/tmp/listudy-discovery-${name}-${width}-${theme}.png`, fullPage: true});
                }
            }
        }
        assert.deepEqual(errors, []);
        console.log('Tactics discovery, shared guides, keyboard help, custom puzzle creation, embed links and responsive themes passed');
    } finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); process.exitCode = 1;});
