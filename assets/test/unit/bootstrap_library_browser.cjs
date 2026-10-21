// Generate the two library fixtures before/after migrating with study_library_controller_test.exs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const current = process.env.LISTUDY_LIBRARY_PREVIEW || '/tmp/listudy-bootstrap-library-after.html';
const baseline = process.env.LISTUDY_LIBRARY_BASELINE || '/tmp/listudy-bootstrap-library-before.html';
(async () => {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json'); res.end('{}'); return;
        }
        if (url.pathname === '/en/studies') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(fs.readFileSync(url.searchParams.has('baseline') ? baseline : current)); return;
        }
        const file = path.join(root, 'priv/static', url.pathname);
        if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const errors = [];
    try {
        const page = await browser.newPage();
        page.on('pageerror', error => errors.push(error.message));
        const origin = `http://127.0.0.1:${server.address().port}`;
        const visit = async previous => {
            await page.goto(origin + '/en/studies' + (previous ? '?baseline=1' : ''));
            await page.waitForSelector('[data-study-library][data-initialized="true"]');
        };
        const geometry = () => page.evaluate(() => Object.fromEntries([
            '.site-header', 'main.container', '.study-library-heading', '.study-library-views',
            '.study-library-toolbar', '.study-library-list', '.study-library-row:not([hidden])', '.site-footer'
        ].map(selector => {
            const node = document.querySelector(selector), bounds = node.getBoundingClientRect();
            return [selector, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }];
        })));
        const differences = [];
        for (const width of [1280, 900, 390, 320]) {
            await page.setViewportSize({ width, height: 900 });
            for (const theme of ['light', 'dark']) {
                await visit(false);
                await page.evaluate(value => localStorage.setItem('data-theme', value), theme);
                await visit(false);
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                const after = await geometry();
                await page.screenshot({ path: `/tmp/listudy-bootstrap-library-${width}-${theme}.png`, fullPage: true });
                await visit(true);
                const before = await geometry();
                await page.screenshot({ path: `/tmp/listudy-bootstrap-library-before-${width}-${theme}.png`, fullPage: true });
                for (const [selector, bounds] of Object.entries(before)) {
                    for (const dimension of ['x', 'y', 'width', 'height']) {
                        if (Math.abs(bounds[dimension] - after[selector][dimension]) > 1) differences.push({width, theme, selector, dimension, before: bounds[dimension], after: after[selector][dimension]});
                    }
                }
            }
        }
        assert.deepEqual(differences, [], 'The library must preserve its existing layout');
        await page.setViewportSize({ width: 1280, height: 900 });
        await visit(false);
        const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.src));
        assert(scripts.some(src => src.includes('/js/bootstrap_ui.js')));
        assert(!scripts.some(src => src.endsWith('/js/app.js')));
        const manage = page.locator('.study-library-manage');
        await manage.locator('summary').click();
        assert.equal(await manage.locator('summary').getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Escape');
        assert.equal(await manage.getAttribute('open'), null);
        assert(await manage.locator('summary').evaluate(node => node === document.activeElement));
        await page.keyboard.press('ArrowDown');
        assert(await page.locator('[data-library-organize]').evaluate(node => node === document.activeElement));
        await page.keyboard.press('Escape');
        assert.equal(await manage.getAttribute('open'), null);
        await manage.locator('summary').click();
        await page.locator('h1').click();
        assert.equal(await manage.getAttribute('open'), null);
        await manage.locator('summary').click();
        await page.locator('[data-library-manage-groups]').click();
        const dialog = page.locator('[data-library-groups-dialog]');
        assert.equal(await dialog.getAttribute('aria-modal'), 'true');
        assert.equal(await page.locator('.modal[aria-modal="true"]').count(), 1);
        for (let i = 0; i < 10; i++) {
            await page.keyboard.press('Tab');
            assert(await dialog.evaluate(node => node.contains(document.activeElement)));
        }
        await page.screenshot({ path: '/tmp/listudy-bootstrap-library-groups.png' });
        const dialogGeometry = () => page.evaluate(() => Object.fromEntries([
            '.study-library-dialog', '#library_groups_title', '.study-library-create-group',
            '.study-library-dialog :is(header, .modal-header) button'
        ].map(selector => {
            const node = document.querySelector(selector), bounds = node.getBoundingClientRect();
            return [selector, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }];
        })));
        const afterDialog = await dialogGeometry();
        await page.keyboard.press('Escape');
        assert(await dialog.isHidden());
        assert(await manage.locator('summary').evaluate(node => node === document.activeElement));
        await visit(true);
        await page.locator('.study-library-manage > summary').click();
        await page.locator('[data-library-manage-groups]').click();
        await page.screenshot({ path: '/tmp/listudy-bootstrap-library-groups-before.png' });
        const beforeDialog = await dialogGeometry();
        for (const [selector, bounds] of Object.entries(beforeDialog)) {
            for (const dimension of ['x', 'y', 'width', 'height']) {
                assert(Math.abs(bounds[dimension] - afterDialog[selector][dimension]) <= 1,
                    `Groups dialog: ${selector} ${dimension} changed`);
            }
        }
        assert.deepEqual(errors, []);
        console.log('Library Bootstrap layout equivalence, themes, dropdown dismissal, focus containment and return passed');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
