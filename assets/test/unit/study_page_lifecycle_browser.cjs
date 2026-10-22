const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fixture = process.env.LISTUDY_STUDY_GAME_PREVIEW || '/tmp/listudy-bootstrap-study-after.html';
(async () => {
    let hold = true;
    const pending = [];
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
        if (url.pathname === '/api/progress' && hold) { pending.push(() => json({})); return; }
        if (url.pathname.startsWith('/api/') || url.pathname.includes('/analysis/studies/')) {
            if (req.method !== 'GET') for await (const chunk of req) { /* Drain the request. */ }
            return json(url.pathname.includes('/positions') ? { positions: [] } : {});
        }
        if (url.pathname === '/en/studies/lifecycle') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(fixture)); return;
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
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (message.type() === 'error' && /Page cleanup failed|Study initialization failed/.test(message.text())) errors.push(message.text());
        });
        await page.addInitScript(() => { localStorage.setItem('puzzleRunMode', 'off'); localStorage.setItem('sound_enabled', 'false'); });
        const url = `http://127.0.0.1:${server.address().port}/en/studies/lifecycle`;
        await page.goto(url);
        await page.waitForFunction(() => document.querySelector('.study-workspace')?.dataset.studyPageState === 'loading');
        await page.evaluate(() => document.querySelector('.study-workspace').dispatchEvent(new Event('study-page-dispose')));
        assert.equal(await page.locator('.study-workspace').getAttribute('data-study-page-state'), 'disposed');
        const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/progress');
        hold = false; pending.splice(0).forEach(release => release());
        await response;
        await page.waitForTimeout(200);
        assert.equal(await page.locator('#chessground cg-board').count(), 0, 'Late hydration must not initialize a disposed board');
        assert.equal(await page.locator('#study_more_actions').getAttribute('data-initialized'), null);
        for (let index = 0; index < 2; index++) {
            await page.goto(url);
            await page.waitForFunction(() => document.querySelector('.study-workspace')?.dataset.studyPageState === 'ready');
            await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
            assert.equal(await page.locator('.study-workspace').getAttribute('data-study-page-state'), 'ready', 'Cached pages retain their live bindings');
            await page.locator('#study_mode').click();
            await page.waitForFunction(() => document.getElementById('study_mode').getAttribute('aria-pressed') === 'true');
            if (index === 1) await page.locator('#open_study_settings').click();
            const activity = await page.evaluate(() => localStorage.getItem(`studyActivity:${study_id}`));
            await page.evaluate(() => document.querySelector('.study-workspace').dispatchEvent(new Event('study-page-dispose')));
            assert.equal(await page.locator('.study-workspace').getAttribute('data-study-page-state'), 'disposed');
            assert.equal(await page.locator('.modal-backdrop').count(), 0, 'Disposal closes owned dialogs and releases their backdrop');
            assert(!await page.evaluate(() => document.body.classList.contains('modal-open')));
            assert.equal(await page.locator('#study_more_actions').getAttribute('data-initialized'), null);
            assert.equal(await page.locator('.study-feedback').getAttribute('data-initialized'), null);
            await page.evaluate(() => {
                window.dispatchEvent(new CustomEvent('study-reading-updated', { detail: { reading: false } }));
                window.dispatchEvent(new CustomEvent('study-sparring-updated', { detail: { active: true } }));
                window.dispatchEvent(new Event('study-puzzle-run-changed'));
                document.querySelector('.study-workspace').dispatchEvent(new Event('study-page-dispose'));
            });
            assert.equal(await page.evaluate(() => localStorage.getItem(`studyActivity:${study_id}`)), activity, 'Disposed activity listeners cannot persist a new mode');
        }
        assert.deepEqual(errors, []);
        console.log('Study page lifecycle: disposal during hydration, back/forward cache, repeated navigation, bindings and activity cleanup passed');
    } finally {
        pending.splice(0).forEach(release => release());
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
