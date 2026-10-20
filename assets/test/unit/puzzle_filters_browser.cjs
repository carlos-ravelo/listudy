const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const base = process.env.LISTUDY_PUZZLES_URL || 'http://127.0.0.1:4015';
const screenshots = process.env.LISTUDY_PUZZLES_SCREENSHOTS || '/tmp/listudy-puzzles-design';
(async () => {
    fs.mkdirSync(screenshots, {recursive: true});
    const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
    try {
        const page = await browser.newPage({viewport: {width: 1366, height: 900}});
        const errors = [], remote = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => {if (/https?:\/\/[^/]*lichess/.test(request.url())) remote.push(request.url());});
        await page.goto(base + '/en/tactics');
        await page.locator('#library-puzzles-theme').selectOption('fork');
        await page.locator('#library-puzzles-min').fill('1000');
        await page.locator('#library-puzzles-max').fill('1400');
        await page.screenshot({path: screenshots + '/tactics-desktop.png', fullPage: true});
        await page.locator('#library-puzzles button').click();
        await page.waitForURL(url => /\/tactics\/puzzles\/\d+$/.test(url.pathname));
        await page.waitForFunction(() => window.chess && window.ground && document.querySelector('[data-phx-main].phx-connected'));
        assert.equal(new URL(page.url()).searchParams.get('theme'), 'fork');
        const original = await page.locator('#puzzle_identity').inputValue();
        const promotion = await page.evaluate(() => {
            const move = chess.move(to_play[0]); chess.undo();
            ground.selectSquare(move.from); ground.selectSquare(move.to);
            return move.promotion;
        });
        if (promotion) await page.locator(`[data-promotion="${promotion}"]`).click();
        await page.waitForFunction(() => chess.history().length >= 2 || !document.getElementById('next').classList.contains('hidden'));
        await page.evaluate(() => {window.__sameDocument = 'puzzle-session'; window.__originalGround = ground; window.__originalFen = chess.fen();});
        await page.locator('#practice-puzzles-theme').selectOption('pin');
        await page.locator('#practice-puzzles-min').fill('1500');
        await page.locator('#practice-puzzles-max').fill('1900');
        await page.waitForFunction(() => document.querySelector('[data-puzzle-count]') && document.getElementById('practice-puzzles-min').value === '1500');
        // Let the debounced LiveView change settle before checking the current attempt.
        await page.waitForTimeout(500);
        assert.equal(await page.locator('#puzzle_identity').inputValue(), original);
        assert(await page.evaluate(() => ground === window.__originalGround && chess.fen() === window.__originalFen));
        assert.equal(new URL(page.url()).searchParams.get('theme'), 'fork');
        await page.locator('#practice-puzzles button').click();
        await page.waitForURL(url => url.searchParams.get('theme') === 'pin');
        await page.waitForFunction(previous => document.getElementById('puzzle_identity').value !== previous, original);
        assert.equal(await page.evaluate(() => window.__sameDocument), 'puzzle-session');
        assert(await page.locator('#next').isHidden());
        await page.screenshot({path: screenshots + '/practice-desktop.png', fullPage: true});
        const selected = await page.locator('#puzzle_identity').inputValue();
        await page.locator('#practice-puzzles-max').fill('1000');
        await page.waitForFunction(() => document.getElementById('practice-puzzles-status').textContent.includes('Minimum rating must not exceed'));
        assert.equal(await page.locator('#practice-puzzles-min').getAttribute('aria-invalid'), 'true');
        await page.locator('#practice-puzzles button').click();
        await page.waitForFunction(() => document.activeElement?.id === 'practice-puzzles-min');
        assert.equal(await page.locator('#puzzle_identity').inputValue(), selected);
        await page.locator('#practice-puzzles-max').fill('1900');
        await page.waitForFunction(() => !document.querySelector('[data-filter-error]'));
        await page.goBack();
        await page.waitForURL(url => url.searchParams.get('theme') === 'fork');
        await page.waitForFunction(() => document.getElementById('practice-puzzles-theme').value === 'fork');
        assert.equal(await page.evaluate(() => window.__sameDocument), 'puzzle-session');
        for (const width of [375, 768, 1366]) {
            await page.setViewportSize({width, height: 900});
            await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
            const geometry = await page.evaluate(() => ({
                controls: document.querySelector('.puzzle-settings').getBoundingClientRect().toJSON(),
                board: document.getElementById('game_container').getBoundingClientRect().toJSON(),
                targets: [...document.querySelectorAll('.puzzle-filters input, .puzzle-filters select, .puzzle-filters button')].map(element => element.getBoundingClientRect().height)
            }));
            assert(geometry.targets.every(height => height >= 44));
            if (width === 375) assert(geometry.controls.bottom <= geometry.board.top, 'Mobile filters precede the board');
            if (width === 1366) assert(geometry.board.right <= geometry.controls.left, 'Desktop controls sit beside the board');
        }
        await page.setViewportSize({width: 375, height: 812});
        await page.screenshot({path: screenshots + '/practice-mobile.png', fullPage: true});
        await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
        await page.screenshot({path: screenshots + '/practice-mobile-dark.png', fullPage: true});
        await page.locator('#practice-puzzles-theme').focus();
        assert.notEqual(await page.locator('#practice-puzzles-theme').evaluate(element => getComputedStyle(element).outlineStyle), 'none');
        await page.goto(base + '/en/tactics');
        assert.equal(await page.locator('.tactics-modes a[href="/en/tactics/random"]').count(), 0);
        assert.equal(await page.getByRole('heading', {name: 'Your tactics library', exact: true}).count(), 0);
        await page.screenshot({path: screenshots + '/tactics-mobile.png', fullPage: true});
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(remote, []);
        assert.deepEqual(errors, []);
        console.log('Inline puzzle filters: desktop, mobile, keyboard, history and current-attempt preservation passed');
    } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});
