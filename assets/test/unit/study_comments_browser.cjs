const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fixture = process.env.LISTUDY_STUDY_GAME_PREVIEW || '/tmp/listudy-bootstrap-study-after.html';
const pgn = '[Event "Comment safety"]\n\n1. e4 { Main &amp; &lt;img src=x onerror=alert(1)&gt; } (1. d4 { Alternative explanation. }) e5 { Reply explanation. } 2. Nf3 { Develop a knight. } Nc6 *';
(async () => {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname.startsWith('/api/') || url.pathname.includes('/analysis/studies/')) {
            if (req.method !== 'GET') for await (const chunk of req) { /* Drain the request. */ }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(url.pathname.includes('/positions') ? { positions: [] } : {})); return;
        }
        if (url.pathname === '/en/studies/comments') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(fs.readFileSync(fixture, 'utf8').replace(/var pgn = clean_pgn\(`[\s\S]*?`\);/,
                () => 'var pgn = ' + JSON.stringify(pgn) + ';')); return;
        }
        const file = path.resolve(root, 'priv/static', '.' + url.pathname);
        if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.statusCode = 404; res.end(); return;
        }
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = [], dialogs = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
        await page.addInitScript(() => { localStorage.setItem('puzzleRunMode', 'off'); localStorage.setItem('sound_enabled', 'false'); });
        await page.goto(`http://127.0.0.1:${server.address().port}/en/studies/comments`);
        await page.waitForFunction(() => document.querySelector('#study_more_actions')?.dataset.initialized);
        await page.locator('#open_study_settings').click();
        await page.locator('#settings_tab_general').click();
        for (let index = 0; index < 3; index++) {
            if (await page.locator('#comments_toggle').textContent() === await page.evaluate(() => i18n.comments_hidden)) break;
            await page.locator('#comments_toggle').click();
        }
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelectorAll('#comments > div').length === 0);
        await page.locator('#hints').click();
        await page.waitForFunction(() => document.getElementById('comment1_text')?.textContent === 'Alternative explanation.');
        assert.equal(await page.locator('#comment0_text').textContent(), 'Main & <img src=x onerror=alert(1)>');
        assert.equal(await page.locator('#comments img, #comments script').count(), 0);
        await page.locator('#study_mode').click();
        await page.waitForFunction(() => document.querySelector('#study_mode').getAttribute('aria-pressed') === 'true');
        await page.locator('#study_next_move').click();
        await page.waitForFunction(() => document.getElementById('commentundefined_bold')?.textContent === 'White 1.e4:');
        assert.equal(await page.locator('#comment0_text').textContent(), 'Reply explanation.');
        assert.equal(await page.locator('#comment1').count(), 0, 'Sibling variations are replaced after navigation');
        await page.locator('#study_previous_move').click();
        await page.waitForFunction(() => document.getElementById('comment1_text')?.textContent === 'Alternative explanation.');
        for (let index = 0; index < 2; index++) {
            await page.evaluate(() => window.dispatchEvent(new CustomEvent('study-comments-updated', { detail: [] })));
            await page.waitForFunction(() => document.querySelectorAll('#comments > div').length === 0);
            assert.equal(await page.locator('#comments > template').count(), 1, 'Clearing preserves the Alpine template');
            await page.locator('#study_next_move').click();
            await page.waitForFunction(() => document.getElementById('commentundefined_text')?.textContent.includes('Main &'));
            await page.locator('#study_previous_move').click();
            await page.waitForFunction(() => document.getElementById('comment1_text')?.textContent === 'Alternative explanation.');
        }
        assert.deepEqual(dialogs, []);
        assert.deepEqual(errors, []);
        console.log('Alpine comments: escaped PGN text, variations, hidden preferences, explicit hints, Read navigation and repeated clearing passed');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
