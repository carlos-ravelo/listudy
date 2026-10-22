const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fixture = process.env.LISTUDY_STUDY_GAME_PREVIEW || '/tmp/listudy-bootstrap-study-after.html';
const keys = ['show_arrows', 'arrow_type', 'show_comments', 'board_review', 'key_moves_mode', 'move_delay_time'];

(async () => {
    let release, remote = {};
    const hydration = new Promise(resolve => { release = resolve; });
    const writes = [];
    let saved;
    const allSaved = new Promise(resolve => { saved = resolve; });
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
        if (url.pathname === '/api/progress') { await hydration; return json(remote); }
        if (url.pathname === '/api/progress/sync') {
            let body = ''; for await (const chunk of req) body += chunk;
            const data = JSON.parse(body);
            if (keys.includes(data.key)) {
                assert(req.headers['x-csrf-token']);
                remote[data.key] = data.value;
                writes.push(data);
                if (new Set(writes.map(write => write.key)).size === keys.length) saved();
            }
            return json({ revision: '1' });
        }
        if (url.pathname.startsWith('/api/') || url.pathname.includes('/analysis/studies/')) {
            return json(url.pathname.includes('/positions') ? { positions: [] } : {});
        }
        if (url.pathname === '/') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(fs.readFileSync(fixture)); return;
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
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => { localStorage.setItem('puzzleRunMode', 'off'); localStorage.setItem('sound_enabled', 'false'); });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => document.getElementById('settings_panel_general')._x_dataStack);
        assert.equal(await page.locator('#arrows_toggle').isDisabled(), true, 'Do not edit preferences before hydration');
        assert.equal(writes.length, 0);
        remote = await page.evaluate(() => ({ show_arrows: i18n.arrows_always, arrow_type: i18n.arrow_type_both,
            show_comments: i18n.comments_always_on, board_review: i18n.review_slow,
            key_moves_mode: i18n.key_move_enabled, move_delay_time: i18n.instant }));
        release();
        await page.waitForFunction(() => !document.getElementById('arrows_toggle').disabled);
        await page.waitForSelector('#chessground cg-board');
        assert.equal(writes.length, 0, 'Hydration must not send defaults back to the account');
        await page.locator('#open_study_settings').click();
        await page.locator('#settings_tab_general').click();
        assert.equal(await page.locator('#arrows_toggle').textContent(), remote.show_arrows);
        assert.equal(await page.locator('#comments_toggle').textContent(), remote.show_comments);
        const change = async (id, key, label, clickId = id) => {
            const expected = await page.evaluate(name => i18n[name], label);
            if (clickId === 'key_move') await page.locator('#key_move').evaluate(node => node.click());
            else await page.locator('#' + clickId).click();
            await page.waitForFunction(({ id, key, expected }) => document.getElementById(id).textContent === expected &&
                localStorage.getItem(key) === expected, { id, key, expected });
        };
        await change('arrows_toggle', 'show_arrows', 'arrows_hidden');
        await page.locator('#arrows_toggle').evaluate(node => { node.textContent = 'An edited label'; });
        await change('arrows_toggle', 'show_arrows', 'arrows_new2x');
        for (const label of ['arrow_type_playable', 'arrow_type_pgn', 'arrow_type_both']) await change('arrow_type', 'arrow_type', label);
        for (const label of ['comments_hidden', 'comments_when_arrows', 'comments_always_on']) await change('comments_toggle', 'show_comments', label);
        await change('line_review', 'board_review', 'review_fast');
        await change('key_move', 'key_moves_mode', 'key_move_disabled');
        assert.equal(await page.locator('#key_move').getAttribute('data-icon'), '%');
        for (const label of ['fast', 'medium', 'slow', 'instant']) await change('move_delay_time', 'move_delay_time', label, 'move_delay');
        let timeout;
        try {
            await Promise.race([allSaved, new Promise((resolve, reject) => {
                timeout = setTimeout(() => reject(new Error('Preference synchronization timed out')), 10000);
            })]);
        } finally { clearTimeout(timeout); }
        const expected = await page.locator('#settings_panel_general').evaluate(node => ({ ...Alpine.$data(node).values }));
        await page.keyboard.press('Escape');
        await page.reload();
        await page.waitForFunction(() => !document.getElementById('arrows_toggle').disabled);
        assert.deepEqual(await page.locator('#settings_panel_general').evaluate(node => ({ ...Alpine.$data(node).values })), expected);
        assert.deepEqual(errors, []);
        console.log('Alpine preferences: delayed hydration, model-owned cycles, labels/icons, account sync and reload passed.');
    } finally {
        release();
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
