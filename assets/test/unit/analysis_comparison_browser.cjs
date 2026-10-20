// Export LISTUDY_COMPARISON_PREVIEW with analysis_training_test.exs first.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fixture = process.env.LISTUDY_COMPARISON_PREVIEW || '/tmp/listudy-comparison-new.html';
const pages = {
    '/comparison': fs.readFileSync(fixture, 'utf8'),
    '/partial': fs.readFileSync(fixture + '.partial.html', 'utf8'),
    '/single': fs.readFileSync(fixture + '.single.html', 'utf8')
};

(async () => {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (pages[url.pathname]) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(pages[url.pathname]);
            return;
        }
        const file = path.join(root, 'priv/static', url.pathname);
        if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.statusCode = 404; res.end(); return;
        }
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/comparison');
        await page.waitForSelector('cg-board');
        assert.equal(await page.locator('#quick-analysis-board').getAttribute('data-ply'), '2');
        assert.equal(await page.locator('[data-select-group="0"]').getAttribute('aria-pressed'), 'true');
        assert((await page.locator('[data-match-group="0"] .analysis-chapter-name').first().textContent()).includes('Z daily repertoire'));
        assert.equal(await page.locator('.analysis-other-matches').getAttribute('open'), null);
        assert.equal(await page.locator('.analysis-chapter-list').first().getAttribute('open'), null);
        assert.equal(await page.locator('.analysis-imported-details').getAttribute('open'), null);
        const practice = page.getByRole('link', { name: 'Practice this line', exact: true });
        assert((await practice.getAttribute('href')).includes('practice_expected=Nf3'));
        assert.equal(await page.locator('.analysis-game-meta time').getAttribute('title') !== null, true, 'Dates are localized with a UTC fallback');
        assert(await page.locator('#analysis-outcomes').evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('.analysis-game-moves')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Outcome precedes the move list');
        await page.locator('#btn-prev').click();
        assert.equal(await page.locator('#quick-analysis-board').getAttribute('data-ply'), '1');
        await page.locator('.analysis-chapter-list > summary').first().click();
        assert.equal(await page.locator('#quick-analysis-board').getAttribute('data-ply'), '1', 'Inspecting equivalent chapters does not reset replay');
        await page.locator('#btn-comparison').click();
        assert.equal(await page.locator('#quick-analysis-board').getAttribute('data-ply'), '2');

        await page.locator('.analysis-other-matches > summary').focus();
        await page.keyboard.press('Enter');
        await page.locator('[data-select-group="1"]').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('[data-select-group="1"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-outcome="0"]').isVisible(), false);
        assert.equal(await page.locator('[data-outcome="1"]').isVisible(), true);
        assert((await practice.getAttribute('href')).includes('practice_expected=Bc4'));
        await page.locator('[data-select-group="0"]').click();
        assert((await practice.getAttribute('href')).includes('practice_expected=Nf3'));
        await page.locator('.analysis-other-matches > summary').click();
        await page.locator('.analysis-chapter-list > summary').first().click();
        for (const width of [320, 390, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Comparison fits ${width}px`);
            const board = await page.locator('#quick-analysis-board').boundingBox();
            assert(Math.abs(board.width - board.height) < 1, 'The board remains square');
        }
        await page.screenshot({ path: '/tmp/listudy-comparison-desktop.png', fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: '/tmp/listudy-comparison-mobile.png', fullPage: true });
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await page.screenshot({ path: '/tmp/listudy-comparison-dark.png', fullPage: true });

        await page.goto(base + '/partial');
        await page.waitForSelector('cg-board');
        assert.equal(await page.locator('.analysis-comparison-warning').getAttribute('open'), null);
        await page.locator('.analysis-comparison-warning > summary').click();
        assert.equal(await page.getByRole('link', { name: 'Needs PGN repair', exact: true }).isVisible(), true);
        assert.equal(await page.getByRole('link', { name: 'Try comparison again', exact: true }).isVisible(), true);
        assert.equal(await practice.isVisible(), true, 'Readable matches remain available for manual practice');

        await page.goto(base + '/single');
        await page.waitForSelector('cg-board');
        assert.equal(await page.locator('[data-select-group]').count(), 0);
        assert.equal(await page.locator('.analysis-other-matches').count(), 0);
        assert.equal(await page.locator('[data-outcome="0"]').isVisible(), true);
        assert.equal(await practice.count(), 0, 'An accepted move is not presented as a mistake');
        await page.locator('#btn-prev').click();
        assert.equal(await page.locator('#quick-analysis-board').getAttribute('data-ply'), '2');
        await page.locator('.analysis-imported-details > summary').click();
        assert((await page.getByRole('textbox', { name: 'Game PGN' }).inputValue()).includes('2. d4'));
        assert.deepEqual(errors, []);
        process.stdout.write('Automatic best match, equivalent chapters, alternatives, replay, partial results, PGN and responsive layouts passed\n');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
