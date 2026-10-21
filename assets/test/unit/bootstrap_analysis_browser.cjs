// Generate LISTUDY_ANALYSIS_PREVIEW with analysis_training_test.exs first.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fixture = process.env.LISTUDY_ANALYSIS_PREVIEW || '/tmp/listudy-bootstrap-after.html';
const baseline = process.env.LISTUDY_ANALYSIS_BASELINE;
const errors = [];

(async () => {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
        if (url.pathname === '/api/progress') return json({});
        if (url.pathname.startsWith('/analysis/new-games/')) return json({ status: 'available' });
        if (url.pathname === '/analysis/sync-status') return json({});
        if (url.pathname === '/analysis') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(fs.readFileSync(url.searchParams.has('baseline') ? baseline : fixture)); return;
        }
        const file = path.join(root, 'priv/static', url.pathname);
        if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.statusCode = 404; res.end(); return;
        }
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/analysis');
        await page.waitForSelector('[data-game-availability="available"]');
        const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.href));
        assert(styles.some(url => url.includes('/css/bootstrap_ui.css')));
        assert(!styles.some(url => url.includes('/css/app.css')));
        assert.equal(await page.locator('script[src$="/js/app.js"]').count(), 0);
        await page.locator('[data-open-pgn]').click();
        await page.waitForFunction(() => document.activeElement?.id === 'pgn');
        await page.screenshot({ path: '/tmp/listudy-bootstrap-modal-after.png' });
        const modal = page.locator('#analysis_pgn_modal');
        assert.equal(await modal.getAttribute('aria-modal'), 'true');
        await page.locator('#pgn').fill('1. e4 c5 2. Nf3');
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Tab');
            assert(await modal.evaluate(node => node.contains(document.activeElement)));
        }
        await page.keyboard.press('Escape');
        await modal.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement?.hasAttribute('data-open-pgn'));
        await page.locator('[data-open-pgn]').click();
        await page.waitForFunction(() => document.activeElement?.id === 'pgn');
        assert.equal(await page.locator('#pgn').inputValue(), '1. e4 c5 2. Nf3');
        await modal.locator('[data-bs-dismiss]').click();
        await modal.waitFor({ state: 'hidden' });
        await page.locator('[data-open-pgn]').click();
        await page.waitForFunction(() => document.activeElement?.id === 'pgn');
        await page.mouse.click(3, 3);
        await modal.waitFor({ state: 'hidden' });
        await page.locator('[data-open-pgn]').click();
        await page.waitForFunction(() => document.activeElement?.id === 'pgn');
        await page.locator('#pgn').fill('');
        let warning;
        page.once('dialog', async dialog => { warning = dialog.message(); await dialog.accept(); });
        await page.getByRole('button', { name: 'Analyze Game', exact: true }).click();
        assert.equal(warning, 'The PGN cannot be empty.');
        assert(await modal.isVisible());
        await page.route('**/analysis/quick', route => route.fulfill({ status: 204 }));
        await page.locator('#pgn').fill('1. e4 c5 2. Nf3 *');
        const [submitted] = await Promise.all([
            page.waitForRequest(request => request.url().endsWith('/analysis/quick') && request.method() === 'POST'),
            page.getByRole('button', { name: 'Analyze Game', exact: true }).click()
        ]);
        const payload = new URLSearchParams(submitted.postData());
        assert.equal(payload.get('pgn'), '1. e4 c5 2. Nf3 *');
        assert(payload.get('_csrf_token'));
        await page.keyboard.press('Escape');
        await modal.waitFor({ state: 'hidden' });
        const search = page.locator('[data-repertoire-search]');
        await search.fill('does not exist');
        assert.equal(await page.locator('[data-repertoire-row]:visible').count(), 0);
        assert(await page.locator('[data-repertoire-empty]').isVisible());
        await search.fill('');
        assert(await page.locator('[data-repertoire-row]:visible').count() > 0);
        const preferences = page.locator('.site-menu').filter({ has: page.locator('#toggle_dark_mode') });
        await preferences.locator(':scope > summary').click();
        await page.locator('#sound_settings').click();
        await page.waitForFunction(() => document.activeElement?.id === 'sound_settings_modal');
        const enable = page.locator('#sound_enable');
        await enable.setChecked(false);
        assert.equal(await page.evaluate(() => localStorage.getItem('sound_enabled')), 'false');
        await page.keyboard.press('Escape');
        await page.locator('#sound_settings_modal').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement?.matches('.site-menu > summary'));
        await preferences.locator(':scope > summary').click();
        await page.locator('#board_settings').click();
        await page.waitForFunction(() => document.activeElement?.id === 'board_settings_modal');
        await page.locator('#chessboard_background').selectOption('green');
        await page.locator('#chessboard_pieces').selectOption('merida');
        assert.equal(await page.evaluate(() => localStorage.getItem('chessground_background')), 'green');
        assert(await page.locator('html').evaluate(node => node.classList.contains('merida')));
        await page.keyboard.press('Escape');
        await page.locator('#board_settings_modal').waitFor({ state: 'hidden' });
        await preferences.locator(':scope > summary').click();
        await page.locator('#toggle_dark_mode').click();
        assert.equal(await page.locator('html').getAttribute('data-bs-theme'), 'dark');
        await page.reload();
        assert.equal(await page.locator('html').getAttribute('data-bs-theme'), 'dark');
        const geometry = () => page.evaluate(() => Object.fromEntries(['.site-header', 'main.container', '.analysis-page-heading', '.analysis-account-grid', '.analysis-library', '.analysis-section-heading', '.analysis-repertoires', '.site-footer'].map(selector => {
            const node = document.querySelector(selector), r = node.getBoundingClientRect();
            return [selector, { x: r.x, y: r.y, width: r.width, height: r.height }];
        })));
        for (const width of [1280, 900, 390, 320]) {
            await page.setViewportSize({ width, height: 900 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(value => localStorage.setItem('data-theme', value), theme);
                await page.goto(origin + '/analysis');
                await page.waitForSelector('[data-game-availability="available"]');
                if (width <= 900) {
                    assert(await page.locator('.site-navigation-links').isHidden());
                    await page.locator('.site-menu-toggle').click();
                    assert(await page.locator('.site-navigation-links').isVisible());
                    await page.locator('.site-menu-toggle').focus();
                    await page.keyboard.press('Escape');
                    assert(await page.locator('.site-navigation-links').isHidden());
                }
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                await page.screenshot({ path: `/tmp/listudy-bootstrap-${width}-${theme}.png`, fullPage: true });
                if (baseline) {
                    const after = await geometry();
                    await page.goto(origin + '/analysis?baseline=1');
                    await page.waitForSelector('[data-game-availability="available"]');
                    const before = await geometry();
                    await page.screenshot({ path: `/tmp/listudy-bootstrap-before-${width}-${theme}.png`, fullPage: true });
                    if (width === 1280 && theme === 'light') {
                        await page.evaluate(() => {
                            const dialog = document.querySelector('.analysis-pgn-dialog');
                            dialog.showModal();
                            dialog.querySelector('textarea').focus();
                        });
                        await page.screenshot({ path: '/tmp/listudy-bootstrap-modal-before.png' });
                    }
                    for (const [selector, bounds] of Object.entries(before)) {
                        for (const dimension of ['x', 'y', 'width', 'height']) {
                            assert(Math.abs(bounds[dimension] - after[selector][dimension]) <= 1,
                                `${width}px ${theme}: ${selector} ${dimension} changed`);
                        }
                    }
                }
            }
        }
        assert.deepEqual(errors, []);
        console.log('Bootstrap analysis: modal focus, keyboard, dismissal, PGN validation, filters, preferences, theme persistence and responsive layout passed');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
