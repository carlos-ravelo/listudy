const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const previews = process.env.LISTUDY_JOURNEY_PREVIEW || '/tmp/listudy-journey-preview';
const read = name => fs.readFileSync(path.isAbsolute(name) ? name : path.join(previews, name + '.html'), 'utf8');
const tacticsPreviews = process.env.LISTUDY_TACTICS_PREVIEW || '/tmp/listudy-tactics-preview';
const tacticsRoute = fs.readFileSync(path.join(tacticsPreviews, 'library.html'), 'utf8').match(/href="([^"]*tactics\/collections\/[^"]+)"/)[1];

(async () => {
    const pages = {
        '/en': 'returning-home', '/daily-home': 'daily-home', '/es': 'new-home', '/en/studies': 'empty-library',
        '/en/studies/new': 'import', '/en/endgames': 'endgames', '/en/endgames/basic': 'endgame-chapter',
        '/en/tactics/daily-puzzle': 'daily-puzzle', '/en/studies/journey-repertoire': 'study'
    };
    pages['/tactics-edit-preview'] = path.join(tacticsPreviews, 'edit.html');
    pages['/en/tactics'] = path.join(tacticsPreviews, 'library.html');
    pages[tacticsRoute] = path.join(tacticsPreviews, 'collection.html');
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const json = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(data)); };
        if (url.pathname === '/api/progress') return json({});
        if (url.pathname === '/api/progress/sync') return json({ revision: '1' });
        if (url.pathname === '/api/collections') return json({ version: 1, collections: [] });
        if (/\/analysis\/studies\/\d+\/positions/.test(url.pathname)) return json({ positions: [] });
        if (url.pathname === '/en/studies/new' && url.searchParams.get('kind') === 'tactics') {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(read(path.join(tacticsPreviews, 'import.html'))); return;
        }
        if (pages[url.pathname]) {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(read(pages[url.pathname])); return;
        }
        const file = path.resolve(root, 'priv/static', '.' + url.pathname);
        if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            response.statusCode = 404; response.end(); return;
        }
        response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
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
        const resume = page.locator('.home-daily-study[data-last-study="true"]');
        await page.waitForFunction(() => document.querySelector('[data-study-continue]').href.endsWith('?mode=sparring'));
        assert.equal(await page.locator('.home-practice-links').count(), 0);
        assert.equal(await page.locator('.home-random-study').count(), 0);
        assert((await resume.getAttribute('href')).endsWith('?mode=sparring'));
        await page.screenshot({ path: '/tmp/listudy-journey-after-home-desktop.png', fullPage: true });
        await resume.click();
        await page.waitForSelector('.study-sparring-active');
        assert.equal(await page.locator('#practice_sparring').getAttribute('aria-pressed'), 'true');
        await page.locator('#study_mode').click();
        await page.waitForFunction(() => localStorage.getItem('studyActivity:journey') === 'read');
        await page.goto(base + '/en');
        await page.waitForFunction(() => document.querySelector('[data-study-continue]').href.endsWith('?mode=read'));
        await page.locator('.home-daily-study[data-last-study="true"]').click();
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
        await page.goto(base + '/en');
        await page.waitForFunction(() => document.querySelector('.home-daily-study').href.endsWith('?mode=smart'));
        await page.goto(base + '/en/endgames');
        const first = await page.locator('[data-endgame-start]').getAttribute('href');
        assert(first.endsWith('/basic/queen/1'));
        await page.evaluate(() => {
            localStorage.setItem('solved_endgames', JSON.stringify(['basic_queen_1']));
        });
        await page.reload();
        await page.waitForFunction(() => document.querySelector('[data-endgame-start]').textContent === 'Continue practicing');
        assert((await page.locator('[data-endgame-start]').getAttribute('href')).endsWith('/basic/queen/2'));
        assert.equal(await page.locator('.endgame-category').count(), 12);
        await page.waitForFunction(() => [...document.querySelectorAll('.endgame-material img')].every(image => image.complete && image.naturalWidth > 0));
        assert((await page.locator('[data-endgame-progress]').first().textContent()).startsWith('1 / '));
        await page.goto(base + '/en/endgames/basic');
        await page.waitForSelector('#basic_queen_1.is-solved');
        assert.equal(await page.locator('#basic_queen_1').getAttribute('aria-label'), 'Exercise 1 · Solved');
        assert.equal(await page.locator('#basic_queen_2').getAttribute('aria-label'), 'Exercise 2');
        assert.equal(await page.locator('.endgame-exercise-group').count(), 4);
        assert.equal(await page.locator('.endgame-exercise').count(), await page.locator('[data-endgame-start]').evaluate(node => JSON.parse(node.dataset.endgameGames).length));
        assert((await page.locator('[data-endgame-progress]').first().textContent()).startsWith('1 / 7'));
        const exerciseBounds = await page.locator('#basic_queen_1').boundingBox();
        assert(exerciseBounds.width >= 44 && exerciseBounds.height >= 44);
        await page.locator('#basic_queen_1').focus();
        await page.keyboard.press('Tab');
        assert(await page.locator('#basic_queen_2').evaluate(node => getComputedStyle(node).outlineStyle !== 'none'));
        await page.evaluate(() => {
            localStorage.setItem('solved_endgames', JSON.stringify(['basic_queen_1', 'basic_queen_2', 'basic_queen_2']));
            window.dispatchEvent(new StorageEvent('storage', {key: 'solved_endgames'}));
        });
        await page.waitForSelector('#basic_queen_2.is-solved');
        assert((await page.locator('[data-endgame-progress]').first().textContent()).startsWith('2 / 7'));
        assert((await page.locator('[data-endgame-start]').getAttribute('href')).endsWith('/basic/queen/3'));
        await page.evaluate(() => {
            localStorage.setItem('solved_endgames', 'invalid json');
            window.dispatchEvent(new StorageEvent('storage', {key: 'solved_endgames'}));
        });
        assert.equal(await page.locator('.endgame-exercise.is-solved').count(), 0);
        assert.equal(await page.locator('[data-endgame-start]').textContent(), 'Start practicing');
        await page.evaluate(() => {
            localStorage.setItem('solved_endgames', JSON.stringify(['basic_queen_1']));
            window.dispatchEvent(new Event('pageshow'));
        });
        await page.waitForSelector('#basic_queen_1.is-solved');

        for (const width of [390, 1280]) {
            await page.setViewportSize({ width, height: 960 });
            for (const route of ['/es', '/en', '/en/studies', '/en/studies/new', '/en/endgames', '/en/endgames/basic']) {
                await page.goto(base + route);
                await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}px`);
                const name = pages[route];
                await page.screenshot({ path: `/tmp/listudy-journey-after-${name}-${width}-dark.png`, fullPage: true });
                await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
                await page.screenshot({ path: `/tmp/listudy-journey-after-${name}-${width}.png`, fullPage: true });
            }
        }
        await page.setViewportSize({ width: 1280, height: 960 });
        await page.goto(base + '/daily-home');
        assert.equal(await page.locator('.home-tactics .home-tactics-link').getAttribute('href'), '/en/tactics');
        assert.equal(await page.locator('cg-board').count(), 0);
        assert.equal(await page.locator('.home-paths > section').count(), 4);
        assert.equal(await page.locator('.home-daily-study').count(), 9);
        assert.equal(await page.locator('.home-daily-study[data-last-study="true"]').count(), 1);
        assert.equal(await page.locator('.home-daily-studies-list li').first().locator('.home-daily-study-recent').count(), 1);
        assert.equal(await page.locator('.home-daily-study-most-used').count(), 1);
        assert.equal(await page.locator('.home-daily-sparring').count(), 0);

        assert(await page.locator('.home-daily-scroll').evaluate(node => node.scrollHeight > node.clientHeight));
        await page.locator('.home-daily-scroll').focus();
        await page.keyboard.press('End');
        await page.waitForFunction(() => document.querySelector('.home-daily-scroll').scrollTop > 0);
        await page.locator('.home-daily-scroll').evaluate(node => node.blur());
        for (const width of [320, 390, 1280]) {
            await page.setViewportSize({width, height: 1100});
            await page.waitForTimeout(100);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Home grid overflows at ${width}px`);
            assert.equal(await page.locator('.home-daily-study:visible').count(), width < 650 ? 4 : 9);
            assert.equal(await page.locator('.home-tactics a[href="/en/blind-tactics"]').count(), 1);
            assert.equal(await page.locator('.home-tactics a[href="/en/pieceless-tactics"]').count(), 1);
            for (const theme of ['light', 'dark']) {
                await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
                await page.screenshot({path: `/tmp/listudy-home-grid-${width}-${theme}.png`, fullPage: true});
            }
        }
        await page.setViewportSize({width: 1366, height: 768});
        await page.goto(base + '/daily-home');
        const activities = await page.locator('.home-paths').boundingBox();
        assert(activities.y + activities.height <= 768, 'All four activities fit on a desktop screen');
        await page.screenshot({path: '/tmp/listudy-home-activities-768.png', fullPage: true});
        await page.locator('.home-daily-puzzle').click();
        await page.waitForSelector('cg-board');
        await page.locator('cg-board').scrollIntoViewIfNeeded();
        const move = await page.evaluate(() => {
            const [from, targets] = [...ground.state.movable.dests.entries()][0];
            return {from, to: targets[0], black: ground.state.orientation === 'black'};
        });
        const board = await page.locator('cg-board').boundingBox();
        const square = name => {
            const file = name.charCodeAt(0) - 97, rank = Number(name[1]);
            return {x: board.x + ((move.black ? 7 - file : file) + .5) * board.width / 8,
                y: board.y + ((move.black ? rank - 1 : 8 - rank) + .5) * board.height / 8};
        };
        const from = square(move.from), to = square(move.to);
        await page.mouse.click(from.x, from.y); await page.mouse.click(to.x, to.y);
        await page.waitForFunction(() => document.getElementById('error').textContent.trim() || document.getElementById('success').textContent.trim() || chess.history().length > 0);
        await page.setViewportSize({width: 1366, height: 768});
        await page.goto(base + '/en/tactics');
        await page.waitForSelector('[data-study-library][data-initialized]');
        assert.equal(await page.locator('main h1').textContent(), 'Your tactics');
        assert.equal(await page.locator('.site-menu[data-nav-section="practice"] a[href="/en/tactics"]').count(), 0);
        const collectionLink = page.locator('.study-library-content').filter({hasText: 'Book exercises'});
        assert.equal(await collectionLink.getAttribute('href'), tacticsRoute);
        await page.locator('.study-library-create').click();
        async function checkTacticsMetadata() {
            assert.equal(await page.locator('#study_training_kind').inputValue(), 'tactics');
            await page.locator('.study-management-side').waitFor({state: 'hidden'});
            assert(await page.locator('.study-metadata-opening').isHidden());
            const original = await page.locator('#study_color').inputValue();
            await page.selectOption('#study_training_kind', 'repertoire');
            await page.locator('.study-management-side').waitFor({state: 'visible'});
            assert(await page.locator('.study-metadata-opening').isVisible());
            assert.equal(await page.locator('#study_color').inputValue(), original);
            await page.selectOption('#study_training_kind', 'tactics');
            await page.locator('.study-management-side').waitFor({state: 'hidden'});
            assert(await page.locator('.study-metadata-opening').isHidden());
            assert.equal(await page.locator('#study_color').inputValue(), original);
        }
        await checkTacticsMetadata();
        await page.screenshot({path: '/tmp/listudy-tactics-import.png', fullPage: true});
        await page.goto(base + '/tactics-edit-preview');
        await checkTacticsMetadata();
        await page.goto(base + '/en/studies/journey-repertoire?mode=lines');
        await page.waitForFunction(() => window.trees?.length && window.ground);
        await page.evaluate(route => {
            localStorage.setItem('show_comments', i18n.comments_always_on);
            localStorage.setItem('show_arrows', i18n.arrows_always);
            localStorage.setItem('puzzleRunMode', 'smart');
            localStorage.setItem(`studyActivity:${route.split('/').pop().split('-')[0]}`, 'smart');
        }, tacticsRoute);
        await page.goto(base + tacticsRoute);
        await page.waitForFunction(() => window.trees?.length && window.ground && document.querySelector('#practice_lines[aria-pressed="true"]'));
        assert(await page.locator('#practice_sparring').isHidden());
        assert(await page.locator('#practice_smart').isHidden());
        assert.equal(await page.locator('#study_practice_choices button:visible').count(), 2);
        await page.goto(base + tacticsRoute + '?mode=smart');
        await page.waitForFunction(() => window.trees?.length && window.ground && document.querySelector('#practice_lines[aria-pressed="true"]'));

        assert.equal(await page.evaluate(() => ground.state.orientation), 'black');
        assert.equal(await page.evaluate(() => chess.turn()), 'b');
        assert.equal(await page.locator('#comments').textContent(), '');
        assert.equal(await page.evaluate(() => ground.state.drawable.autoShapes.length), 0);
        assert.equal(await page.locator('.site-primary-navigation > a[data-nav-section="tactics"]').getAttribute('aria-current'), 'location');
        await page.locator('#open_study_settings').click();
        await page.locator('#settings_tab_general').click();
        assert.equal(await page.locator('#comments_toggle').textContent(), await page.evaluate(() => i18n.comments_hidden));
        assert(await page.locator('#settings_tab_sparring').isHidden());
        await page.locator('#comments_toggle').click();
        await page.locator('#comments_toggle').click();
        assert.equal(await page.evaluate(() => localStorage.getItem('tactics_show_comments')), await page.evaluate(() => i18n.comments_always_on));
        assert.equal(await page.evaluate(() => localStorage.getItem('show_comments')), await page.evaluate(() => i18n.comments_always_on));
        await page.keyboard.press('Escape');
        await page.reload();
        await page.waitForFunction(() => window.trees?.length && window.ground);
        assert((await page.locator('#comments').textContent()).includes('Black controls the centre'));
        await page.locator('#open_study_settings').click();
        await page.locator('#settings_tab_general').click();
        await page.locator('#comments_toggle').click();
        assert.equal(await page.evaluate(() => localStorage.getItem('tactics_show_comments')), await page.evaluate(() => i18n.comments_hidden));
        assert.equal(await page.evaluate(() => localStorage.getItem('show_comments')), await page.evaluate(() => i18n.comments_always_on));
        await page.keyboard.press('Escape');
        // Move through the same board handlers used by Full lines in repertoire studies.
        await page.evaluate(() => { ground.selectSquare('e7'); ground.selectSquare('e5'); });
        await page.waitForFunction(() => chess.history().length === 2);
        assert.deepEqual(await page.evaluate(() => chess.history()), ['e5', 'Nf3']);
        assert.equal(await page.locator('#comments').textContent(), '');
        await page.locator('#study_mode').click();
        await page.waitForFunction(() => document.querySelector('#study_mode').getAttribute('aria-pressed') === 'true');
        assert((await page.locator('#comments').textContent()).includes('Black controls the centre'));
        await page.locator('#practice_lines').click();
        for (const width of [320, 390, 1366]) {
            await page.setViewportSize({width, height: 768});
            for (const route of ['/en/tactics', tacticsRoute, '/en/studies/new?kind=tactics']) {
                await page.goto(base + route);
                await page.waitForSelector('.site-header[data-navigation-ready]');
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Tactics overflow at ${width}: ${route}`);
                if (route === '/en/tactics' || route === tacticsRoute) await page.screenshot({path: `/tmp/listudy-tactics-${route === tacticsRoute ? 'play' : 'library'}-${width}.png`, fullPage: true});
            }
        }
        assert.deepEqual(errors, []);
        console.log('Home grid, Daily list scrolling, study-mode shortcuts, responsive layouts, playable puzzle and shared tactics PGN flow passed');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
