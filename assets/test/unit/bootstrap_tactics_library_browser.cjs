const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const current = process.env.LISTUDY_TACTICS_PREVIEW || '/tmp/listudy-tactics-after';
const baseline = process.env.LISTUDY_TACTICS_BASELINE || '/tmp/listudy-tactics-before';
(async () => {
    let submitted;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/en/tactics/puzzles/start') {
            submitted = Object.fromEntries(url.searchParams);
            res.setHeader('Content-Type', 'text/html'); res.end('<p id="started">Practice</p>'); return;
        }
        if (url.pathname === '/en/tactics') {
            const file = url.searchParams.get('fixture') || 'library';
            if (!['library', 'library-collections', 'empty', 'filtered'].includes(file)) {res.statusCode = 404; res.end(); return;}
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            let html = fs.readFileSync(path.join(url.searchParams.has('baseline') ? baseline : current, file + '.html'), 'utf8');
            if (url.searchParams.has('baseline')) html = html.replace('/js/app.js', '/js/bootstrap_site.js').replace('data-library-ui="native"', 'data-library-ui="bootstrap"');
            res.end(html); return;
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
        const base = `http://127.0.0.1:${server.address().port}`;
        const visit = async (fixture, old = false, query = '') => {
            await page.goto(`${base}/en/tactics?fixture=${fixture}${old ? '&baseline=1' : ''}${query}`);
            if (fixture.startsWith('library')) await page.waitForSelector('[data-study-library][data-initialized="true"]');
        };
        const geometry = () => page.evaluate(() => Object.fromEntries([
            '.site-header', 'main.container', '.tactics-cards', '.puzzle-launcher', '.tactics-collections', '.tactics-modes'
        ].map(selector => {
            const element = document.querySelector(selector), r = element.getBoundingClientRect();
            return [selector, {x: r.x, y: r.y, width: r.width, columns: getComputedStyle(element).gridTemplateColumns}];
        })));
        for (const width of [1366, 900, 390, 320]) {
            await page.setViewportSize({width, height: 900});
            for (const fixture of ['library', 'empty']) for (const theme of ['light', 'dark']) {
                await visit(fixture); await page.evaluate(value => localStorage.setItem('data-theme', value), theme); await visit(fixture);
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${fixture} ${width}px overflow`);
                const after = await geometry();
                await page.screenshot({path: `/tmp/listudy-bootstrap-tactics-${fixture}-${width}-${theme}.png`, fullPage: true});
                await visit(fixture, true);
                for (const [selector, before] of Object.entries(await geometry())) {
                    assert(Math.abs(before.x - after[selector].x) <= 1 && Math.abs(before.width - after[selector].width) <= 1, `${fixture} ${width}px ${selector} width/position`);
                    assert(Math.abs(before.y - after[selector].y) <= 1, `${fixture} ${width}px ${selector} vertical position`);
                    assert.equal(after[selector].columns, before.columns);
                }
            }
        }
        await page.setViewportSize({width: 1366, height: 900});
        for (const fixture of ['library', 'library-collections']) {
            await visit(fixture, false, '&q=saved&theme=fork&min_rating=1500&max_rating=1700');
            assert.equal(await page.locator('[data-library-row]:visible').count(), 1);
            assert((await page.locator('[data-library-row]:visible').textContent()).includes('Saved tactics'));
            assert.equal(await page.locator('script[src*="/js/app.js"],link[href*="/css/app.css"]').count(), 0);
            assert.equal(await page.locator('[data-library-view], [data-library-organize], #library_groups_dialog').count(), 0);
            const search = page.locator('[data-library-search]');
            await search.fill('missing collection');
            assert.equal(await page.locator('[data-library-row]:visible').count(), 0);
            await page.locator('[data-library-show-all]').click();
            assert.equal(await page.locator('[data-library-row]:visible').count(), 2);
            assert.equal(await search.inputValue(), '');
            const params = new URL(page.url()).searchParams;
            assert.equal(params.get('q'), null); assert.equal(params.get('theme'), 'fork'); assert.equal(params.get('min_rating'), '1500');
            const href = await page.locator('[data-library-row] a').first().getAttribute('href');
            assert(href.startsWith('/en/tactics/collections/'));
            await search.fill('book exercises');
            await page.locator('.site-menu').filter({has: page.locator('#toggle_dark_mode')}).locator(':scope > summary').click();
            await page.locator('#board_settings').click();
            await page.waitForFunction(() => document.activeElement.id === 'board_settings_modal');
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => !document.body.classList.contains('modal-open'));
            assert.equal(await search.inputValue(), 'book exercises');
            assert.equal(await page.locator('[data-library-row]:visible').count(), 1);
            assert.equal(await page.locator('.tactics-modes a[href="/en/blind-tactics"]').count(), 1);
            assert.equal(await page.locator('.tactics-modes a[href="/en/pieceless-tactics"]').count(), 1);
            assert.equal(await page.locator('.tactics-modes').evaluate(node => getComputedStyle(node).fontVariant), 'normal');
        }
        await visit('filtered');
        assert.equal(await page.locator('#library-puzzles-theme').inputValue(), 'fork');
        assert.equal(await page.locator('#library-puzzles-min').inputValue(), '1500');
        assert.equal(await page.locator('#library-puzzles-max').inputValue(), '1700');
        await page.locator('#library-puzzles-min').fill('1600');
        await page.locator('#library-puzzles-max').fill('1800');
        await page.locator('#library-puzzles button[type=submit]').click();
        await page.locator('#started').waitFor();
        assert.deepEqual(submitted, {theme: 'fork', min_rating: '1600', max_rating: '1800'});
        assert.equal((await page.context().cookies()).find(cookie => cookie.name === 'puzzle_rating')?.value, '1600:1800');
        assert.deepEqual(errors, []);
        console.log('Bootstrap tactics library: preserved panels/themes, guest layout, shared search, saved collections, preferences, visualization links and puzzle filter submission passed');
    } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); process.exitCode = 1;});
