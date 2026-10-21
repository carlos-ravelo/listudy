const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const previews = process.env.LISTUDY_JOURNEY_PREVIEW || '/tmp/listudy-journey-preview';
const pages = {
    '/en': path.join(previews, 'daily-home.html'),
    '/es': path.join(previews, 'new-home.html'),
    '/en/studies/journey-repertoire': path.join(previews, 'study.html'),
    '/analysis': process.env.LISTUDY_ANALYSIS_PREVIEW || '/tmp/listudy-analysis-new.html'
};
(async () => {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const json = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(data)); };
        if (url.pathname === '/api/progress/sync') return json({ revision: '1' });
        if (url.pathname === '/api/collections') return json({ version: 1, collections: [] });
        if (url.pathname.startsWith('/api/')) return json({});
        if (/\/analysis\/studies\/\d+\/positions/.test(url.pathname)) return json({ positions: [] });
        if (url.pathname === '/analysis/sync-status') return json({ lichess: null, chess_com: null });
        if (url.pathname.includes('/new-games/')) return json({ status: 'current' });
        if (pages[url.pathname]) {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(fs.readFileSync(pages[url.pathname])); return;
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
        browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
        const page = await browser.newPage({viewport: {width: 1366, height: 768}});
        const base = `http://127.0.0.1:${server.address().port}`;
        const errors = [], boards = [];
        page.on('pageerror', error => errors.push(error.message));
        const visit = async route => {
            await page.goto(base + route);
            await page.waitForSelector('.site-header[data-navigation-ready]');
            assert(await page.locator('body').evaluate(node => node.classList.contains('site-layout')));
        };
        await visit('/en');
        assert(await page.locator('.home-paths').evaluate(node => node.getBoundingClientRect().bottom <= innerHeight));
        const preferences = page.locator('.site-menu').filter({has: page.locator('#board_settings')});
        await preferences.locator(':scope > summary').click();
        assert(await preferences.locator('.site-menu-panel').evaluate(node => getComputedStyle(node).position === 'static'));
        await page.keyboard.press('Escape');
        assert.equal(await preferences.getAttribute('open'), null);
        await page.keyboard.press('Escape');
        assert(await page.locator('.site-brand').evaluate(node => document.activeElement === node));
        await preferences.locator(':scope > summary').click();
        await page.locator('#board_settings').click();
        await page.waitForSelector('#board_settings_modal', {state: 'visible'});
        assert.equal(await page.evaluate(() => document.elementFromPoint(20, 20).id), 'board_settings_modal');
        await page.locator('#board_settings_modal [data-bs-dismiss="modal"]').click();
        await preferences.locator(':scope > summary').click();
        await page.locator('#toggle_dark_mode').click();
        await page.screenshot({path: '/tmp/listudy-sidebar-home-dark.png', fullPage: true});
        await page.evaluate(() => { localStorage.setItem('data-theme', 'light'); document.documentElement.setAttribute('data-theme', 'light'); });
        for (const width of [320, 390, 900, 1024, 1279, 1280, 1366, 1440]) {
            await page.setViewportSize({width, height: 768});
            for (const route of ['/en', '/en/studies/journey-repertoire', '/analysis']) {
                await visit(route);
                if (route === '/en/studies/journey-repertoire') await page.waitForSelector('#chessground cg-board');
                if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) {
                    await page.screenshot({path: '/tmp/listudy-sidebar-overflow.png', fullPage: true});
                    console.log(await page.evaluate(() => [...document.querySelectorAll('main *')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).map(node => ({tag: node.tagName, id: node.id, cls: String(node.className), width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right})).slice(0, 15)));
                }
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
                const header = await page.locator('.site-header').boundingBox();
                const main = await page.locator('main').boundingBox();
                const side = width >= 1280;
                assert.equal(await page.locator('.site-header').evaluate(node => getComputedStyle(node).position), side ? 'fixed' : 'static');
                if (side) {
                    assert.equal(Math.round(header.width), 176);
                    assert(main.x >= header.width, `${route} overlaps the sidebar`);
                }
                if (route === '/en/studies/journey-repertoire') {
                    const board = await page.locator('#chessground cg-board').boundingBox();
                    assert(board.x >= (side ? 176 : 0));
                    assert(board.x + board.width <= width + 1);
                    if (side) assert(board.width >= 320, `Study board too small at ${width}`);
                    const title = page.locator('.study-context h1');
                    assert.equal(await title.count(), 1);
                    assert(await page.locator('.study-session-tools #study_more_actions').count());
                    if (width === 1366) {
                        const titleBounds = await title.boundingBox();
                        const chapterBounds = await page.locator('.study-chapter-navigation').boundingBox();
                        assert(Math.abs(titleBounds.y + titleBounds.height / 2 - chapterBounds.y - chapterBounds.height / 2) < 2);
                        const actions = await page.locator('#study_board_actions').boundingBox();
                        assert(actions.y + actions.height <= 768, `Board controls require scrolling: ${JSON.stringify({ board, actions })}`);
                        await title.evaluate(node => { node.textContent = 'A very long repertoire title '.repeat(15); });
                        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                        const longBoard = await page.locator('#chessground cg-board').boundingBox();
                        assert.equal(longBoard.y, board.y, 'Long study title shifts the board');
                        await title.evaluate(node => { node.textContent = node.title; });
                        await page.locator('#study_more_actions > summary').click();
                        await page.locator('[data-study-dialog="study_info_dialog"]').first().click();
                        assert(await page.locator('#study_info_dialog').isVisible());
                        await page.keyboard.press('Escape');
                        assert(await page.locator('#study_more_actions > summary').evaluate(node => document.activeElement === node));
                        await page.locator('#open_study_settings').click();
                        assert(await page.locator('#study_settings_dialog').isVisible());
                        await page.keyboard.press('Escape');
                        await page.locator('#study_settings_dialog').waitFor({state: 'hidden'});
                        for (const height of [640, 900, 768]) {
                            await page.setViewportSize({width, height});
                            await page.waitForFunction(() => {
                                const board = document.querySelector('#chessground cg-board').getBoundingClientRect();
                                const controls = document.getElementById('study_board_actions').getBoundingClientRect();
                                return board.width === board.height && controls.bottom <= innerHeight;
                            });
                        }
                    }
                    boards.push({width, board: Math.round(board.width)});
                    assert.equal(await page.locator('.site-primary-navigation > a[aria-current="location"]').textContent(), 'Your Studies');
                }
                if ([390, 1366].includes(width)) await page.screenshot({path: `/tmp/listudy-sidebar-${route === '/en' ? 'home' : route === '/analysis' ? 'analysis' : 'study'}-${width}.png`, fullPage: true});
            }
        }
        await page.setViewportSize({width: 390, height: 844}); await visit('/en');
        await page.locator('.site-menu-toggle').click();
        await preferences.locator(':scope > summary').click();
        await page.setViewportSize({width: 1366, height: 768});
        await page.waitForFunction(() => document.querySelector('.site-menu-toggle').getAttribute('aria-expanded') === 'false');
        assert.equal(await preferences.getAttribute('open'), null);
        await page.setViewportSize({width: 390, height: 844});
        assert(await page.locator('.site-navigation-links').isHidden());
        await page.setViewportSize({width: 1366, height: 420}); await visit('/en');
        await preferences.locator(':scope > summary').click();
        await page.locator('.site-language-menu > summary').click();
        const language = page.locator('.site-language-menu a').last();
        await language.focus();
        const bounds = await language.boundingBox();
        assert(bounds.y >= 0 && bounds.y + bounds.height <= 420);
        await page.setViewportSize({width: 1366, height: 768}); await visit('/es');
        assert(await page.locator('.site-menu-toggle').isHidden());
        assert.deepEqual(errors, []);
        console.log('Sidebar, responsive transitions, keyboard focus, settings overlays, short-window scrolling and home/study/analysis layouts passed');
        console.log('Study board widths:', JSON.stringify(boards));
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
