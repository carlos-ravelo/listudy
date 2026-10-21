const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const previews = process.env.LISTUDY_CREATE_PREVIEW || '/tmp/listudy-create-preview';
(async () => {
    let saved;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (req.method === 'POST') {
            let text = ''; req.on('data', chunk => text += chunk);
            req.on('end', () => { saved = JSON.parse(text); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({url: '/saved'})); });
            return;
        }
        if (url.pathname === '/saved') return res.end('Created');
        const fixture = url.pathname === '/tactics' ? 'tactics' : url.pathname === '/repertoire' ? 'repertoire' : null;
        const file = fixture ? path.join(previews, fixture + '.html') : path.resolve(root, 'priv/static', '.' + url.pathname);
        if ((!fixture && !file.startsWith(root + '/priv/static/')) || !fs.existsSync(file)) {res.statusCode = 404; res.end(); return;}
        res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
        const page = await browser.newPage({viewport: {width: 1280, height: 900}});
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        const visit = async route => {await page.goto(`http://127.0.0.1:${server.address().port}${route}`); await page.waitForSelector('#editor_board cg-board');};
        const square = async key => {
            const box = await page.locator('#editor_board cg-board').boundingBox();
            await page.mouse.click(box.x + (key.charCodeAt(0) - 97 + .5) * box.width / 8, box.y + (8 - Number(key[1]) + .5) * box.height / 8);
        };
        await visit('/repertoire');
        await page.locator('#editor_title').fill('My first repertoire');
        await square('e2'); await square('e4');
        await page.locator('#editor_comment').fill('Control the centre');
        await page.locator('#editor_engine').click();
        await page.waitForFunction(() => {
            const state = Alpine.$data(document.getElementById('chapter_editor'));
            return state.analysisText && state.analysisText !== document.getElementById('chapter_editor').dataset.analysing;
        }, {timeout: 30000});
        assert(!(await page.locator('.chapter-editor-engine').textContent()).includes('unavailable'));
        await page.locator('#editor_engine').click();
        await page.locator('#editor_save').click(); await page.waitForURL('**/saved');
        assert(saved.draft.pgn.includes('e4'));
        assert(saved.draft.pgn.includes('Control the centre'));
        assert.equal(saved.draft.title, 'My first repertoire');
        assert.equal(saved.draft.private, true);
        await visit('/tactics');
        await page.getByRole('button', {name: 'Set up a position', exact: true}).click();
        await page.getByRole('button', {name: 'Clear board', exact: true}).click();
        await page.getByRole('button', {name: 'Cancel', exact: true}).click();
        await page.waitForFunction(() => document.querySelectorAll('#editor_board cg-board piece:not(.ghost)').length === 32);
        await page.getByRole('button', {name: 'Set up a position', exact: true}).click();
        await page.getByRole('button', {name: 'Clear board', exact: true}).click();
        await page.getByRole('button', {name: 'Use position', exact: true}).click();
        assert((await page.locator('#editor_status').textContent()).includes('one king'));
        for (const [name, key] of [['White King', 'f7'], ['Black King', 'h8'], ['White Queen', 'g6']]) {
            await page.getByRole('button', {name, exact: true}).click(); await square(key);
        }
        await page.getByRole('button', {name: 'Use position', exact: true}).click();
        await page.waitForFunction(() => !Alpine.$data(document.getElementById('chapter_editor')).setupMode);
        await square('g6'); await square('g7');
        await page.locator('#editor_title').fill('Mate in one');
        await page.locator('#editor_save').click(); await page.waitForURL('**/saved');
        assert(saved.draft.pgn.includes('Qg7#'));
        assert(saved.draft.pgn.includes('7k/5K2/6Q1/8/8/8/8/8'));
        assert.equal(saved.draft.training_kind, 'tactics');
        for (const width of [390, 1280]) {
            await page.setViewportSize({width, height: 900}); await visit('/tactics');
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.getByRole('button', {name: 'Set up a position', exact: true}).click();
            await page.mouse.move(0, 0);
            await page.waitForTimeout(300);
            await page.screenshot({path: `/tmp/listudy-create-${width}.png`, fullPage: true});
        }
        assert.deepEqual(errors, []);
        console.log('Creation from moves, position composition, validation, local Stockfish analysis and responsive layouts passed');
    } finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); process.exitCode = 1;});
