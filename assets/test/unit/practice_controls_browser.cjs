// Compare emitted styles before/after changes to shared practice variants.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const baseline = process.env.LISTUDY_PRACTICE_BASELINE || '/tmp/listudy-practice-before';
const pages = {
    '/library': ['/tmp/listudy-tactics-after/studies.html', '[data-study-library][data-initialized]', '.study-library-create'],
    '/tactics': ['/tmp/listudy-tactics-after/library.html', '[data-study-library][data-initialized]', '.puzzle-practice-button'],
    '/train': ['/tmp/listudy-analysis-after/train.html', '#chess-training-board cg-board', '#hint-btn'],
    '/study': ['/tmp/listudy-analysis-after/study.html', '#chessground cg-board', '#hints'],
    '/create': ['/tmp/listudy-management-after/repertoire.html', '.study-create', '.study-form-actions .practice-primary']
};
(async () => {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname.startsWith('/api/') || url.pathname.includes('/analysis/studies/')) {
            for await (const chunk of req) {}
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(url.pathname.includes('/positions') ? {positions: []} : url.pathname === '/api/collections' ? {revision: '1', data: {active: 'Default', collections: {Default: []}}} : {})); return;
        }
        if (pages[url.pathname]) {
            let html = fs.readFileSync(pages[url.pathname][0], 'utf8');
            if (url.searchParams.has('baseline')) html = html.replaceAll('href="/css/bootstrap_', 'href="/baseline/bootstrap_');
            res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return;
        }
        const old = url.pathname.startsWith('/baseline/');
        const directory = old ? baseline : path.join(root, 'priv/static');
        const relative = old ? url.pathname.slice('/baseline/'.length) : url.pathname;
        const file = path.join(directory, relative);
        if (!file.startsWith(directory + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.statusCode = 404; res.end(); return;}
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
    try {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            localStorage.setItem('data-theme', new URL(location.href).searchParams.get('theme') || 'light');
            localStorage.setItem('puzzleRunMode', 'off');
            localStorage.setItem('sound_enabled', 'false');
        });
        const visit = async (route, theme, old = false) => {
            await page.goto(`http://127.0.0.1:${server.address().port}${route}?theme=${theme}${old ? '&baseline=1' : ''}`);
            await page.waitForSelector(pages[route][1]);
        };
        const settle = () => page.evaluate(() => Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {}))));
        const snapshot = () => page.evaluate(() => {
            const properties = ['color', 'background-color', 'border', 'border-inline-start', 'border-radius', 'box-shadow', 'display', 'grid-template-columns', 'flex-direction', 'flex-wrap', 'gap', 'padding', 'margin', 'min-height', 'font-size', 'font-weight', 'line-height', 'outline', 'outline-offset'];
            const selectors = '.study-library,.study-library-row,.tactics-cards,.tactics-source-panel,.training-container,.training-sidebar,.study-workspace,.study-context,.study-board-actions,.study-comment-panel,.study-session-end,.study-create-layout,.study-create-card,.practice-panel,.practice-primary,.practice-secondary,.study-library-create,.study-library-practice,.puzzle-practice-button,.puzzle-filters input,.puzzle-filters select,#study_session_continue,#hints';
            return [...document.querySelectorAll(selectors)].map(node => {
                const style = getComputedStyle(node), r = node.getBoundingClientRect();
                return {tag: node.tagName, classes: node.className, x: r.x, y: r.y, width: r.width, height: r.height, style: Object.fromEntries(properties.map(key => [key, style.getPropertyValue(key)]))};
            });
        });
        for (const width of [1280, 900, 390, 320]) {
            await page.setViewportSize({width, height: 900});
            for (const route of Object.keys(pages)) for (const theme of ['light', 'dark']) {
                const states = [];
                for (const old of [false, true]) {
                    await visit(route, theme, old);
                    await page.mouse.move(0, 0); await settle();
                    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${width}px overflow`);
                    const values = [await snapshot()];
                    if (width === 1280) {
                        const action = page.locator(pages[route][2]).first();
                        await action.hover(); await settle(); values.push(await snapshot());
                        await page.mouse.move(0, 0); await page.keyboard.press('Tab'); await action.focus(); await settle(); values.push(await snapshot());
                        if (await action.evaluate(node => node.tagName === 'BUTTON')) {
                            await action.evaluate(node => {node.disabled = true;}); await settle(); values.push(await snapshot());
                        }
                    }
                    states.push(values);
                }
                assert.deepEqual(states[0], states[1], `${route} ${width}px ${theme}: layout and visual states remain unchanged`);
            }
        }
        assert.deepEqual(errors, []);
        console.log('Shared practice controls: library, tactics, game training, study and creation preserve layouts, surfaces, themes, hover, focus and disabled states');
    } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); process.exitCode = 1;});
