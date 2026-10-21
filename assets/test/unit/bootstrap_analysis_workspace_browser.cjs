// Generate before/after fixtures with analysis_training_test.exs preview variables.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const current = process.env.LISTUDY_WORKSPACE_PREVIEW || '/tmp/listudy-analysis-after';
const baseline = process.env.LISTUDY_WORKSPACE_BASELINE || '/tmp/listudy-analysis-before';

(async () => {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/api/progress') {
            res.setHeader('Content-Type', 'application/json'); res.end('{}'); return;
        }
        if (url.pathname === '/api/progress/sync') {
            for await (const chunk of req) {}
            res.setHeader('Content-Type', 'application/json'); res.end('{"revision":"1"}'); return;
        }
        const name = url.pathname.slice(1);
        if (['games', 'games.html.filtered', 'train', 'comparison', 'comparison.html.partial', 'comparison.html.single', 'uploaded', 'empty', 'filtered_empty', 'unavailable'].includes(name)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(fs.readFileSync(path.join(url.searchParams.has('baseline') ? baseline : current, name + '.html'))); return;
        }
        const file = path.join(root, 'priv/static', url.pathname);
        if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.statusCode = 404; res.end(); return;}
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
    try {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            const now = Date.now;
            window.practiceClockOffset = 0;
            Date.now = () => now() + window.practiceClockOffset;
        });
        const base = `http://127.0.0.1:${server.address().port}`;
        const visit = async (name, old = false) => {
            await page.goto(`${base}/${name}${old ? '?baseline=1' : ''}`);
            if (name === 'train') await page.waitForSelector('#chess-training-board cg-board');
            if (name.startsWith('comparison') || name === 'uploaded') await page.waitForSelector('#quick-analysis-board cg-board');
        };
        const regions = async name => page.evaluate(selectors => Object.fromEntries(selectors.map(selector => {
            const node = document.querySelector(selector), r = node.getBoundingClientRect();
            return [selector, {x: r.x, y: r.y, width: r.width, height: r.height, columns: getComputedStyle(node).gridTemplateColumns}];
        })), ['.site-header', 'main.container', ...(name === 'train' ? ['.training-container', '#chess-training-board', '.training-sidebar']
            : name === 'comparison' ? ['.analysis-comparison-layout', '#quick-analysis-board', '.analysis-matches'] : ['.analysis-games-filters', '.analysis-games-list'])]);
        for (const width of [1280, 900, 390, 320]) {
            await page.setViewportSize({width, height: 900});
            for (const name of ['games', 'comparison', 'train']) for (const theme of ['light', 'dark']) {
                await visit(name);
                await page.evaluate(value => localStorage.setItem('data-theme', value), theme);
                await visit(name);
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${width}px overflow`);
                const after = await regions(name);
                await page.screenshot({path: `/tmp/listudy-bootstrap-workspace-${name}-${width}-${theme}.png`, fullPage: true});
                await visit(name, true);
                for (const [selector, before] of Object.entries(await regions(name))) {
                    assert(Math.abs(before.x - after[selector].x) <= 1 && Math.abs(before.width - after[selector].width) <= 1, `${name} ${width}px ${selector} horizontal layout`);
                    assert.equal(after[selector].columns, before.columns, `${name} ${width}px columns`);
                    if (selector.includes('board')) assert(Math.abs(before.y - after[selector].y) <= 1 && Math.abs(before.height - after[selector].height) <= 1, `${name} ${width}px board position/size`);
                }
            }
        }
        const preferences = async () => {
            await page.locator('.site-menu').filter({has: page.locator('#toggle_dark_mode')}).locator(':scope > summary').click();
            await page.locator('#board_settings').click();
            await page.waitForFunction(() => document.activeElement.id === 'board_settings_modal');
        };
        await page.setViewportSize({width: 1280, height: 900});
        await visit('comparison');
        assert.equal(await page.locator('script[src*="/js/app.js"],link[href*="/css/app.css"]').count(), 0);
        const ply = await page.locator('#quick-analysis-board').getAttribute('data-ply');
        await preferences();
        await page.keyboard.press('Tab'); await page.keyboard.press('ArrowLeft');
        await page.locator('#btn-prev').evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true})));
        assert.equal(await page.locator('#quick-analysis-board').getAttribute('data-ply'), ply, 'Preference fields do not navigate replay');
        await page.keyboard.press('Escape'); await page.locator('#board_settings_modal').waitFor({state: 'hidden'});
        await page.waitForFunction(() => !document.body.classList.contains('modal-open'));
        await page.locator('#btn-prev').focus(); await page.keyboard.press('ArrowLeft');
        assert.equal(await page.locator('#quick-analysis-board').getAttribute('data-ply'), String(Number(ply) - 1));

        await page.evaluate(() => localStorage.clear());
        await page.evaluate(() => new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase('listudy-progress');
            request.onsuccess = resolve; request.onerror = () => reject(request.error);
        }));
        await visit('train');
        const session = () => page.evaluate(() => new Promise((resolve, reject) => {
            const request = indexedDB.open('listudy-progress', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result, transaction = db.transaction('progress', 'readonly');
                const read = transaction.objectStore('progress').getAll();
                transaction.oncomplete = () => {
                    const key = document.getElementById('chess-training-board').dataset.studyKey + '_chapter_stats';
                    const record = read.result.find(item => item.key.startsWith('progress:user:') && item.key.endsWith(':' + key));
                    db.close(); resolve(record ? Object.values(JSON.parse(record.value).studySessions || {})[0] : null);
                };
            };
        }));
        await page.locator('#hint-btn').click();
        assert.equal(await page.locator('#training-status').textContent(), 'Hint shown');
        await page.locator('#solve-btn').click();
        const before = await session();
        assert(before, 'Practice persists a session');
        await preferences();
        await page.evaluate(() => { window.practiceClockOffset += 60000; document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true})); });
        await page.keyboard.press('Escape'); await page.locator('#board_settings_modal').waitFor({state: 'hidden'});
        await page.waitForFunction(() => !document.body.classList.contains('modal-open'));
        await page.locator('#next-mistake-btn').click();
        const finished = await session();
        assert(finished.activeMs - before.activeMs < 5000, 'Time in preferences is excluded from practice');
        await page.locator('#training-summary').waitFor({state: 'visible'});
        await page.locator('#training-summary [data-review-all]').click();
        await page.locator('#solve-btn').click();
        await page.waitForFunction(() => document.getElementById('training-status').textContent === 'Solution shown');
        await page.locator('#next-mistake-btn').click();
        await page.locator('#training-summary').waitFor({state: 'visible'});

        for (const name of ['games.html.filtered', 'empty', 'filtered_empty', 'unavailable', 'uploaded']) {
            await visit(name);
            assert.equal(await page.locator('link[href*="bootstrap_analysis.css"]').count(), 1);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        await visit('games.html.filtered');
        await page.locator('[data-game-filters-more] > summary').click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-game-filters-more]').getAttribute('open'), null);
        assert.deepEqual(errors, []);
        console.log('Bootstrap analysis workspace: preserved layout/themes, replay isolation, practice timing, hints/answers, summary, filters, empty/unmatched/uploaded pages passed');
    } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); process.exitCode = 1;});
