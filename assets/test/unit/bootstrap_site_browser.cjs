const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const current = process.env.LISTUDY_SITE_PREVIEW || '/tmp/listudy-site-after';
const baseline = process.env.LISTUDY_SITE_BASELINE || '/tmp/listudy-site-before';
(async () => {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname.startsWith('/api/')) {for await (const chunk of req) {} res.setHeader('Content-Type', 'application/json'); res.end('{}'); return;}
        const name = url.pathname.slice(1), directory = url.searchParams.has('baseline') ? baseline : current;
        if (/^[a-z-]+$/.test(name) && fs.existsSync(path.join(directory, name + '.html'))) {
            let html = fs.readFileSync(path.join(directory, name + '.html'), 'utf8');
            if (url.searchParams.has('baseline')) html = html.replaceAll('/css/app.css', '/baseline/app.css').replaceAll('/js/app.js', '/js/bootstrap_site.js');
            res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return;
        }
        const file = url.pathname === '/baseline/app.css' ? '/tmp/listudy-site-css-before/app.css' : path.join(root, 'priv/static', url.pathname);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {res.statusCode = 404; res.end(); return;}
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
    try {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const base = `http://127.0.0.1:${server.address().port}`;
        const visit = async (name, theme, old = false) => {
            await page.goto(`${base}/${name}?theme=${theme}${old ? '&baseline=1' : ''}`);
            await page.evaluate(value => {document.documentElement.dataset.theme = value; document.documentElement.dataset.bsTheme = value; localStorage.setItem('data-theme', value);}, theme);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        };
        const geometry = () => page.evaluate(() => [...document.querySelectorAll('.site-header, main.container, main > h1, main > section, main > div, .study-library-row, .column')].filter(node => node.getClientRects().length).map(node => {
            const r = node.getBoundingClientRect(); return {tag: node.tagName, classes: node.className, x: r.x, y: r.y, width: r.width, height: r.height};
        }));
        for (const width of [1280, 900, 390, 320]) {
            await page.setViewportSize({width, height: 900});
            for (const name of ['home', 'privacy', 'signin', 'events', 'openings', 'players', 'motif', 'books', 'endgames', 'custom', 'iframe', 'admin', 'search']) for (const theme of ['light', 'dark']) {
                await visit(name, theme); const after = await geometry();
                const afterWidth = await page.evaluate(() => document.documentElement.scrollWidth);
                await visit(name, theme, true); const before = await geometry();
                const beforeWidth = await page.evaluate(() => Math.max(innerWidth, document.documentElement.scrollWidth));
                assert(afterWidth <= beforeWidth + 1, `${name} ${width}px: no added overflow`);
                assert.equal(after.length, before.length, `${name}: same regions`);
                for (let i = 0; i < before.length; i++) for (const key of ['x', 'y', 'width', 'height']) {
                    assert(Math.abs(before[i][key] - after[i][key]) <= 1, `${name} ${width}px ${theme} ${before[i].classes} ${key}: ${before[i][key]} -> ${after[i][key]}`);
                }
            }
        }
        await page.setViewportSize({width: 1280, height: 900});
        for (const name of ['home', 'search', 'books', 'admin']) {
            await visit(name, 'dark');
            await page.locator('.site-menu').filter({has: page.locator('#toggle_dark_mode')}).locator(':scope > summary').click();
            await page.locator('#board_settings').click();
            await page.waitForFunction(() => document.activeElement.id === 'board_settings_modal');
            await page.keyboard.press('Tab');
            assert(await page.locator('#board_settings_modal').evaluate(node => node.contains(document.activeElement)));
            await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.body.classList.contains('modal-open'));
            assert.equal(await page.locator('.modal-backdrop').count(), 0);
        }
        await visit('book', 'light');
        for (const trigger of ['.book-expert-trigger', '[data-bs-target="#bootstrap-book_Amazon_modal"]']) {
            await page.locator(trigger).click();
            await page.locator('.book-modal.show').waitFor();
            await page.keyboard.press('Tab'); assert(await page.locator('.book-modal.show').evaluate(node => node.contains(document.activeElement)));
            await page.keyboard.press('Escape'); assert.equal(await page.locator('.modal-backdrop').count(), 0);
            assert(await page.locator(trigger).evaluate(node => node === document.activeElement));
        }
        const lifecycle = await page.evaluate(async source => {
            const {StudySearchColors} = await import('data:text/javascript,' + encodeURIComponent(source));
            const el = document.createElement('div');
            const button = '<button data-library-color="white" aria-pressed="false">White</button>';
            el.innerHTML = button; document.body.appendChild(el);
            const events = [], hook = {...StudySearchColors, el, pushEvent: (name, data) => events.push(data.color)};
            hook.mounted(); hook.mounted(); el.firstChild.click();
            el.innerHTML = button; el.firstChild.click();
            hook.destroyed(); el.firstChild.click(); hook.destroyed();
            hook.mounted(); el.firstChild.click(); hook.destroyed(); el.remove();
            return events;
        }, fs.readFileSync(path.join(root, 'assets/js/components/color_toggles.js'), 'utf8'));
        assert.deepEqual(lifecycle, ['white', 'white', 'all'], 'LiveView hook remains delegated across patches, mounts once and releases listeners');
        assert.deepEqual(errors, []);
        console.log('Site Bootstrap: content/auth/admin/search/LiveView/native layouts in both themes and four widths, shared preferences and book dialogs passed');
    } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); process.exitCode = 1;});
