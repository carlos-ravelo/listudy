const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const previews = process.env.LISTUDY_JOURNEY_PREVIEW || '/tmp/listudy-journey-preview';
const read = name => fs.readFileSync(path.join(previews, name + '.html'), 'utf8');

(async () => {
    const pages = {
        '/en': 'returning-home', '/es': 'new-home', '/en/studies': 'empty-library',
        '/en/studies/new': 'import', '/en/endgames': 'endgames', '/en/endgames/basic': 'endgame-chapter',
        '/en/studies/journey-repertoire': 'study'
    };
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const json = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(data)); };
        if (url.pathname === '/api/progress') return json({});
        if (url.pathname === '/api/progress/sync') return json({ revision: '1' });
        if (url.pathname === '/api/collections') return json({ version: 1, collections: [] });
        if (/\/analysis\/studies\/\d+\/positions/.test(url.pathname)) return json({ positions: [] });
        if (pages[url.pathname]) {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(read(pages[url.pathname])); return;
        }
        const file = path.resolve(root, 'priv/static', '.' + url.pathname);
        if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            response.statusCode = 404; response.end(); return;
        }
        response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const base = `http://127.0.0.1:${server.address().port}`;
        await page.goto(base + '/en');
        await page.evaluate(() => localStorage.setItem('studyActivity:journey', 'sparring'));
        await page.reload();
        const resume = page.locator('[data-study-continue]');
        await page.waitForFunction(() => document.querySelector('[data-study-continue]').href.endsWith('?mode=sparring'));
        assert.equal(await page.locator('.home-practice-links').count(), 0);
        assert.equal(await page.locator('.home-random-study').count(), 1);
        assert((await resume.getAttribute('href')).endsWith('?mode=sparring'));
        await page.screenshot({ path: '/tmp/listudy-journey-after-home-desktop.png', fullPage: true });
        await resume.click();
        await page.waitForSelector('.study-sparring-active');
        assert.equal(await page.locator('#practice_sparring').getAttribute('aria-pressed'), 'true');
        await page.locator('#study_mode').click();
        await page.waitForFunction(() => localStorage.getItem('studyActivity:journey') === 'read');
        await page.goto(base + '/en');
        await page.waitForFunction(() => document.querySelector('[data-study-continue]').href.endsWith('?mode=read'));
        await page.locator('[data-study-continue]').click();
        await page.waitForSelector('#study_read_moves:not([hidden])');
        await page.reload();
        await page.waitForSelector('#study_read_moves:not([hidden])');
        assert.equal(new URL(page.url()).searchParams.has('mode'), false, 'A launch link must not override later mode choices');
        await page.locator('#practice_smart').click();
        await page.waitForFunction(() => localStorage.getItem('studyActivity:journey') === 'smart');
        await page.reload();
        await page.waitForFunction(() => document.getElementById('practice_smart').getAttribute('aria-pressed') === 'true');
        await page.goto(base + '/en/studies/journey-repertoire?practice=chapter&chapter_index=0');
        await page.waitForSelector('cg-board');
        await page.waitForFunction(() => document.getElementById('practice_lines').getAttribute('aria-pressed') === 'true');
        assert.equal(await page.evaluate(() => localStorage.getItem('studyActivity:journey')), 'smart');
        await page.goto(base + '/en/endgames');
        const first = await page.locator('[data-endgame-start]').getAttribute('href');
        assert(first.endsWith('/basic/queen/1'));
        await page.evaluate(() => {
            localStorage.setItem('solved_endgames', JSON.stringify(['basic_queen_1']));
        });
        await page.reload();
        await page.waitForFunction(() => document.querySelector('[data-endgame-start]').textContent === 'Continue practicing');
        assert((await page.locator('[data-endgame-start]').getAttribute('href')).endsWith('/basic/queen/2'));
        for (const width of [390, 1280]) {
            await page.setViewportSize({ width, height: 960 });
            for (const route of ['/es', '/en', '/en/studies', '/en/studies/new', '/en/endgames']) {
                await page.goto(base + route);
                await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}px`);
                const name = pages[route];
                await page.screenshot({ path: `/tmp/listudy-journey-after-${name}-${width}-dark.png`, fullPage: true });
                await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
                await page.screenshot({ path: `/tmp/listudy-journey-after-${name}-${width}.png`, fullPage: true });
            }
        }
        assert.deepEqual(errors, []);
        console.log('Home-to-study mode restoration, chapter-link priority, endgame continuation, localization and mobile/desktop layouts passed');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
