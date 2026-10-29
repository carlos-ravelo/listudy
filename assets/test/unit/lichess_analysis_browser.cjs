// Requires compiled assets. Generates the real Study page in the test database;
// LISTUDY_LICHESS_ANALYSIS_PREVIEW can supply an already rendered fixture instead.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const first = '[Event "First chapter"]\n\n1. d4 c5\n{First explanation}\n\n2. d5 e5\n\n(2... d6 3. e4) 3. e4 *';
const second = '[Event "Second chapter"]\n\n1. e4 e5\n{Another explanation}\n\n2. Nf3 Nc6 (2... Nf6 3. Nxe5) 3. Bb5 *';
const longMoves = Array.from({ length: 300 }, (_, index) => `${index + 1}. ${index % 2 ? 'Ng1 Ng8' : 'Nf3 Nf6'}`).join(' ');
const large = `[Event "Large chapter"]\n\n1. Nf3 {Retain this comment in the download} Nf6 (1... d5 2. d4) ${longMoves.slice(longMoves.indexOf('2. '))} *`;
const pgn = [first, second, large].join('\n\n');

(async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'listudy-analysis-link-'));
    let browser, server;
    try {
        const preview = process.env.LISTUDY_LICHESS_ANALYSIS_PREVIEW || path.join(temp, 'study.html');
        if (!process.env.LISTUDY_LICHESS_ANALYSIS_PREVIEW) {
            execFileSync('mix', ['test', 'test/listudy_web/controllers/lichess_analysis_test.exs'], {
                cwd: root, env: { ...process.env, LISTUDY_LICHESS_ANALYSIS_PREVIEW: preview }, stdio: 'pipe'
            });
        }
        const template = fs.readFileSync(preview, 'utf8');
        assert.match(template, /var pgn = clean_pgn\(`/, 'Use the real Study template and entry point');
        const html = template.replace(/var pgn = clean_pgn\(`[\s\S]*?`\);/, () => 'var pgn = ' + JSON.stringify(pgn) + ';');
        server = http.createServer((request, response) => {
            const url = new URL(request.url, 'http://localhost');
            if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
            if (url.pathname.startsWith('/api/') || url.pathname.includes('/analysis/studies/')) {
                response.setHeader('Content-Type', 'application/json'); response.end('{}'); return;
            }
            const file = path.resolve(root, 'priv/static', '.' + url.pathname);
            if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
                response.statusCode = 404; response.end(); return;
            }
            response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
            response.end(fs.readFileSync(file));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
        const context = await browser.newContext({ acceptDownloads: true });
        const navigations = [];
        await context.route('https://lichess.org/**', route => {
            navigations.push(route.request().url());
            return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Analysis destination</title>' });
        });
        const page = await context.newPage(), errors = [], dialogs = [], downloads = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
        page.on('download', download => downloads.push(download));
        await page.addInitScript(() => {
            localStorage.setItem('puzzleRunMode', 'off');
            localStorage.setItem('sound_enabled', 'false');
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => document.querySelector('#chapter_select')?.options.length === 3 &&
            document.querySelector('#analysis_board')?.getAttribute('href')?.includes('/analysis/pgn/'));
        async function analyze() {
            const nextPage = context.waitForEvent('page');
            await page.click('#analysis_board');
            const popup = await nextPage;
            await popup.waitForLoadState('domcontentloaded');
            const destination = new URL(popup.url());
            await popup.close();
            return destination;
        }
        async function chooseChapter(index) {
            await page.click('#current_chapter_title');
            await page.locator('.chapter-choice').nth(index).click();
            assert.equal(await page.locator('#chapter_select').inputValue(), String(index));
        }
        function inlinePgn(destination) {
            assert.equal(destination.origin, 'https://lichess.org');
            assert.equal(destination.searchParams.get('color'), 'white');
            assert(destination.pathname.startsWith('/analysis/pgn/'));
            return decodeURIComponent(destination.pathname.slice('/analysis/pgn/'.length));
        }
        const firstSent = inlinePgn(await analyze());
        assert.equal(firstSent, '[Event "First chapter"] 1. d4 c5 2. d5 e5 (2... d6 3. e4) 3. e4 *',
            'The actual click sends the complete main line and variation without blank lines');
        assert.equal(dialogs.length, 0);
        assert.equal(downloads.length, 0);

        await chooseChapter(1);
        const secondSent = inlinePgn(await analyze());
        assert.equal(secondSent, '[Event "Second chapter"] 1. e4 e5 2. Nf3 Nc6 (2... Nf6 3. Nxe5) 3. Bb5 *',
            'Changing chapter updates both the action and its PGN');
        assert(!secondSent.includes('First chapter'));

        await chooseChapter(2);
        const downloadReady = page.waitForEvent('download');
        const fallback = await analyze(), download = await downloadReady;
        assert.equal(fallback.origin, 'https://lichess.org');
        assert.equal(fallback.pathname, '/analysis');
        assert.equal(fallback.searchParams.get('color'), 'white');
        assert.equal(fallback.hash, '#menu');
        assert.equal(download.suggestedFilename(), 'chapter.pgn');
        assert.equal(fs.readFileSync(await download.path(), 'utf8'), large,
            'The downloaded chapter retains every move, variation and comment');
        assert.deepEqual(dialogs, [await page.locator('#analysis_board').getAttribute('data-import-prompt')]);
        assert.equal(downloads.length, 1);

        await chooseChapter(0);
        assert.equal(inlinePgn(await analyze()), firstSent, 'Returning to a small chapter removes the old fallback');
        assert.equal(downloads.length, 1, 'A stale chapter handler cannot download the preceding large PGN');
        assert.equal(dialogs.length, 1);
        assert.equal(navigations.length, 4, 'All Analyze navigations were intercepted locally');
        assert.deepEqual(errors, []);
        console.log('Analyze click: complete PGN/variations, chapter changes, large-chapter download/prompt and fallback reset passed');
    } finally {
        await browser?.close();
        if (server) await new Promise(resolve => server.close(resolve));
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
