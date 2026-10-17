// Generate fixtures with LISTUDY_ANALYSIS_PREVIEW, LISTUDY_TRAIN_PREVIEW and
// LISTUDY_STUDY_GAME_PREVIEW when running analysis_training_test.exs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const overview = fs.readFileSync(process.env.LISTUDY_ANALYSIS_PREVIEW || '/tmp/listudy-analysis-new.html', 'utf8');
const train = fs.readFileSync(process.env.LISTUDY_TRAIN_PREVIEW || '/tmp/listudy-train-new.html', 'utf8');
const study = fs.readFileSync(process.env.LISTUDY_STUDY_GAME_PREVIEW || '/tmp/listudy-study-game-new.html', 'utf8');
const twoChapterStudy = study.replace(/var pgn = clean_pgn\(`[\s\S]*?`\);/, () => 'var pgn = ' + JSON.stringify(
    '[Event "Main repertoire"]\n\n1. e4 e5 2. Nf3 *\n\n[Event "Side line"]\n\n1. d4 d5 2. c4 *'
) + ';');
const decode = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const key = train.match(/data-study-key="([^"]+)"/)[1] + '_chapter_stats';
const source = JSON.parse(decode(train.match(/data-mistakes="([^"]+)"/)[1]));
const games = fs.readFileSync(process.env.LISTUDY_GAMES_PREVIEW || '/tmp/listudy-games-new.html', 'utf8');
const filteredGames = fs.readFileSync((process.env.LISTUDY_GAMES_PREVIEW || '/tmp/listudy-games-new.html') + '.filtered.html', 'utf8');
const encode = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function multiplePositionTrain() {
    const ChessModule = require('chess.js');
    const Chess = ChessModule.Chess || ChessModule;
    const chess = new Chess();
    chess.move('e4'); chess.move('e5');
    const positions = [{ ...source[0], fen: chess.fen() }];
    chess.move('Nf3'); chess.move('Nc6');
    positions.push({ ...source[0], fen: chess.fen(), expected: 'Bc4', times_repeated: 1 });
    chess.move('Bc4'); chess.move('Bc5');
    positions.push({ ...source[0], fen: chess.fen(), expected: 'd3', times_repeated: 1 });
    return train.replace(/data-study-pgn="[^"]*"/, 'data-study-pgn="' + encode('[Event "Main repertoire"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 *') + '"')
        .replace(/data-mistakes="[^"]*"/, 'data-mistakes="' + encode(JSON.stringify(positions)) + '"');
}
let cloud = {}, revisions = {}, stale = false, availability = 'current', syncPollState = 'running', multiple = false, directedStudy = false;
const errors = [];
let testRun = 0;
(async () => {
 const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    if (url.pathname === '/api/progress') return json({ ...cloud, _progress_revisions: revisions });
    if (url.pathname === '/api/progress/sync') {
        let body = ''; for await (const chunk of req) body += chunk;
        if (req.headers['x-test-run'] !== String(testRun)) return json({ revision: '1' });
        const data = JSON.parse(body); cloud[data.key] = data.value;
        revisions[data.key] = String(Number(revisions[data.key] || 0) + 1);
        return json({ revision: revisions[data.key] });
    }
    if (/\/analysis\/studies\/\d+\/positions/.test(url.pathname)) return json({ positions: source });
    if (url.pathname === '/analysis/sync-status') return json({ lichess: { status: syncPollState, details: 'Sync status' }, chess_com: null });
    if (url.pathname.includes('/new-games/')) {
        if (availability === 'unavailable') res.statusCode = 503;
        return json({ status: availability });
    }
    if (url.pathname === '/analysis' || url.pathname === '/analysis/games' || url.pathname === '/train' || url.pathname.startsWith('/en/studies/')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        const raw = url.pathname === '/analysis' ? overview : url.pathname === '/analysis/games' ? (url.search ? filteredGames : games)
            : url.pathname === '/train' ? (multiple ? multiplePositionTrain() : train) : directedStudy ? twoChapterStudy : study;
        const body = raw.replace('</head>', '<style>' + fs.readFileSync(path.join(root, 'assets/css/features/analysis_presentation.css'), 'utf8') + fs.readFileSync(path.join(root, 'assets/css/features/practice_theme.css'), 'utf8') + '</style></head>');
        res.end(stale && url.pathname === '/train' ? body.replace(/&quot;expected&quot;:&quot;Nf3&quot;/g, '&quot;expected&quot;:&quot;d4&quot;') : body);
        return;
    }
    if (url.pathname === '/api/collections') return json({ version: 1, collections: [] });
    const file = path.join(root, 'priv/static', url.pathname);
    if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(fs.readFileSync(file));
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = 'http://127.0.0.1:' + server.address().port;
 const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
 try {
    const start = async () => {
        testRun++;
        cloud = {}; revisions = {}; stale = false;
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: {'x-test-run': String(testRun)} });
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/train');
        try { await page.waitForSelector('cg-board'); }
        catch (error) { throw new Error(error.message + '\n' + await page.locator('body').innerText() + '\n' + errors.join('\n')); }
        return { context, page };
    };
    const stats = page => page.evaluate(key => new Promise((resolve, reject) => {
        const open = indexedDB.open('listudy-progress', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result, transaction = db.transaction('progress', 'readonly');
            const read = transaction.objectStore('progress').getAll();
            transaction.oncomplete = () => {
                const record = read.result.find(record => record.key.startsWith('progress:user:') && record.key.endsWith(':' + key));
                db.close(); resolve(record ? JSON.parse(record.value) : null);
            };
            transaction.onabort = () => { db.close(); reject(transaction.error); };
        };
    }), key);
    const entry = data => Object.values(data.chapters)[0];
    const card = data => entry(data).positionReviews.cards['e4|e5'];
    const play = async (page, from, to) => {
        const box = await page.locator('#chess-training-board cg-board').boundingBox();
        const square = name => ({ x: box.x + (name.charCodeAt(0) - 97 + .5) * box.width / 8, y: box.y + (8 - Number(name[1]) + .5) * box.height / 8 });
        const a = square(from), b = square(to);
        await page.mouse.click(a.x, a.y); await page.mouse.click(b.x, b.y);
    };
    let { context, page } = await start();
    assert.equal(card(await stats(page)).card.reps, 0);
    assert.equal(entry(await stats(page)).attempts, 0);
    await page.screenshot({ path: '/tmp/listudy-train-desktop.png', fullPage: true });
    const lineUrl = await page.getByRole('link', { name: 'Practice this line', exact: true }).getAttribute('href');
    assert(lineUrl.includes('practice_fen='));
    await play(page, 'g1', 'f3');
    await page.waitForFunction(() => document.getElementById('training-status').textContent === 'Correct!');
    let saved = await stats(page);
    assert.equal(card(saved).gameEvidence.pending, false);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const successContrast = await page.locator('#training-status').evaluate(element => {
        const luminance = color => {
            const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
            return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const a = luminance(getComputedStyle(element).color), b = luminance(getComputedStyle(document.body).backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    assert(successContrast >= 4.5, 'Success feedback has readable contrast in dark mode');
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    assert((await page.locator('#training-progress-status').textContent()).includes('0 to review now'));
    assert.equal(entry(saved).coveredMoves.length, 1);
    assert.equal(Object.values(saved.studySessions)[0].reviewCount, 1);
    await page.locator('#next-mistake-btn').click();
    assert.equal(await page.locator('#training-summary-title').textContent(), 'Session complete');
    assert((await page.locator('#training-summary-result').textContent()).includes('1 recalled without help'));
    assert((await page.locator('#training-summary-result').textContent()).includes('0 not attempted'));
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    for (let tries = 0; tries < 100 && !cloud[key]; tries++) await page.waitForTimeout(20);
    assert(cloud[key], 'Practice is synchronized to the account');
    await page.goto(base + '/analysis');
    await page.waitForFunction(() => document.querySelector('[data-game-review-status]')?.textContent === 'Reviews scheduled');
    assert((await page.locator('[data-repertoire-row]').textContent()).includes('2 / 2 games with deviations'));
    const account = page.locator('[data-sync-platform="lichess"]');
    const sync = account.locator('button[type="submit"]');
    for (const state of ['available', 'current', 'unavailable', 'syncing', 'available']) {
        availability = state;
        await page.reload();
        await page.waitForFunction(state => document.querySelector('[data-sync-platform="lichess"]').dataset.gameAvailability === state, state);
        assert.equal(await sync.isDisabled(), state === 'syncing');
        assert.equal(await sync.evaluate(button => button.classList.contains('button-primary')), state === 'available');
        assert.equal(await account.getAttribute('aria-busy'), String(state === 'syncing'));
        if (state === 'available') {
            assert.equal(await sync.textContent(), 'Sync new games');
            assert.equal(await account.locator('[data-new-games-status] strong').textContent(), 'New games available');
            const notice = await account.locator('[data-new-games-status]').boundingBox();
            const button = await sync.boundingBox();
            assert(notice.y >= button.y + button.height, 'The notice has its own full-width row');
        }
        if (state === 'syncing') {
            availability = 'current'; syncPollState = 'completed';
            await page.waitForFunction(() => document.querySelector('[data-sync-platform="lichess"]')?.dataset.gameAvailability === 'current');
            assert.equal(await sync.isDisabled(), false, 'A sync discovered after rendering is polled until it finishes');
            syncPollState = 'running';
        }
    }
    for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overview fits ${width}px`);
    }
    await page.screenshot({ path: '/tmp/listudy-analysis-new-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/listudy-analysis-new-mobile.png', fullPage: true });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: '/tmp/listudy-analysis-available-dark.png', fullPage: true });
    await page.route('**/analysis/sync', async route => {
        assert.equal(route.request().method(), 'POST');
        assert(route.request().postData().includes('lichess'));
        await route.fulfill({ status: 200, contentType: 'text/html', body: overview.replace('data-sync-state="idle"', 'data-sync-state="running"') });
    });
    const submission = page.waitForRequest('**/analysis/sync');
    await sync.click();
    await submission;
    await page.waitForFunction(() => document.querySelector('[data-sync-platform="lichess"]')?.dataset.gameAvailability === 'syncing');
    assert.equal(await sync.isDisabled(), true);
    await page.unroute('**/analysis/sync');
    availability = 'current';
    await page.goto(base + '/train'); await page.waitForSelector('#training-empty:visible');
    assert.equal(await page.locator('#chess-training-board').isVisible(), false, 'Due now does not drill future reviews');
    assert.equal(card(await stats(page)).gameEvidence.pending, false, 'Reload does not reopen the same game observation');
    await page.locator('#training-scope').selectOption('all');
    await page.waitForSelector('cg-board');
    assert(page.url().includes('scope=all'));
    const earned = card(await stats(page)).card.due;
    await play(page, 'g1', 'f3');
    await page.waitForFunction(() => document.getElementById('training-status').textContent === 'Correct!');
    assert.equal(card(await stats(page)).card.due, earned, 'Optional early practice preserves the earned interval');
    await page.goto(base + lineUrl);
    await page.waitForFunction(() => document.getElementById('practice_smart')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('#smart_run_status').isVisible(), true);
    assert.equal(await page.evaluate(() => window.curr_move.length), 1, 'Practice line starts at the chapter lead-in rather than an unrelated Smart prompt');
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.screenshot({ path: '/tmp/listudy-analysis-line.png', fullPage: true });

    directedStudy = true;
    const chapterUrl = new URL(lineUrl, base);
    chapterUrl.search = new URLSearchParams({ chapter_index: '1', chapter: 'Side line', practice: 'chapter' }).toString();
    await page.evaluate(() => {
        localStorage.setItem('puzzleRunMode', 'smart');
        localStorage.setItem('fullLineRunMode', 'random');
    });
    await page.goto(chapterUrl.href);
    await page.waitForFunction(() => window.trees?.length === 2 && document.getElementById('practice_lines')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('#chapter_select').inputValue(), '1', 'An Analysis chapter link keeps the requested chapter despite the saved Smart preference');
    assert.equal(await page.evaluate(() => window.studyPuzzleRunMode), 'off');
    assert.equal(await page.evaluate(() => localStorage.getItem('puzzleRunMode')), 'smart', 'Opening a chapter preserves the normal study preference');
    assert.equal(await page.evaluate(() => localStorage.getItem('fullLineRunMode')), 'random');
    assert.equal(await page.locator('#puzzle_run').inputValue(), 'off', 'A directed visit does not auto-advance to a different chapter');
    await page.reload();
    await page.waitForFunction(() => window.chapter === 1 && window.studyPuzzleRunMode === 'off');

    const ChessModule = require('chess.js');
    const position = new (ChessModule.Chess || ChessModule)(); position.move('d4'); position.move('d5');
    const directedLine = new URL(chapterUrl);
    directedLine.searchParams.delete('practice');
    directedLine.searchParams.set('practice_fen', position.fen());
    directedLine.searchParams.set('practice_expected', 'c4');
    for (const preference of ['smart', 'off']) {
        await page.evaluate(mode => localStorage.setItem('puzzleRunMode', mode), preference);
        await page.goto(directedLine.href);
        await page.waitForFunction(() => window.studyPuzzleRunMode === 'smart' && window.chapter === 1);
        assert.equal(await page.evaluate(() => window.curr_move[0]), 1, 'Targeted line practice resolves the requested chapter before Smart can change it');
        assert.equal(await page.evaluate(() => localStorage.getItem('puzzleRunMode')), preference, 'Targeted practice does not replace the saved mode');
    }
    directedLine.searchParams.set('practice_expected', 'Nf3');
    await page.goto(directedLine.href);
    await page.waitForFunction(() => document.getElementById('info')?.textContent.includes('outside the current practice scope'));
    assert.equal(await page.evaluate(() => window.chapter), 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('puzzleRunMode')), 'off');
    await page.evaluate(() => localStorage.setItem('puzzleRunMode', 'smart'));
    const regularUrl = new URL(chapterUrl); regularUrl.search = '';
    await page.goto(regularUrl.href);
    await page.waitForFunction(() => window.studyPuzzleRunMode === 'smart' && document.getElementById('smart_run_status')?.hidden === false);
    assert.equal(await page.locator('#practice_smart').getAttribute('aria-pressed'), 'true', 'A normal visit resumes Smart');
    directedStudy = false;
    assert.equal(errors.length, 0, errors.join('\n'));
    await context.close();

    ({ context, page } = await start());
    await page.getByRole('button', { name: 'Hint', exact: true }).click();
    await play(page, 'g1', 'f3');
    await page.waitForFunction(() => document.getElementById('training-status').textContent.includes('another review'));
    saved = await stats(page);
    assert.equal(card(saved).gameEvidence.pending, true);
    assert.equal(entry(saved).coveredMoves?.length || 0, 0, 'Hints do not create independent coverage');
    await context.close();

    ({ context, page } = await start());
    await play(page, 'd2', 'd4');
    await page.waitForFunction(() => document.getElementById('training-status').textContent === 'Try again');
    await page.waitForFunction(() => !document.getElementById('hint-btn').disabled);
    assert.equal(await page.locator('#training-status').textContent(), 'Try again', 'Feedback stays after the board resets');
    await play(page, 'g1', 'f3');
    await page.waitForFunction(() => document.getElementById('training-status').textContent.includes('another review'));
    saved = await stats(page);
    assert.equal(card(saved).history.length, 1, 'A correction does not add a second graded review');
    assert.equal(Object.values(saved.studySessions)[0].reviewCount, 1);
    await context.close();

    ({ context, page } = await start());
    await page.getByRole('button', { name: 'Show answer' }).click();
    saved = await stats(page);
    assert.equal(card(saved).recovered, false);
    assert.equal(entry(saved).coveredMoves?.length || 0, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/listudy-train-mobile.png', fullPage: true });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: '/tmp/listudy-train-dark.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => ({tag:el.tagName,id:el.id,cls:el.className,width:el.getBoundingClientRect().width})))));
    stale = true;
    await page.reload(); await page.waitForSelector('#chess-training-board[hidden]', { state: 'attached' });
    assert.equal(await page.locator('#training-controls').isVisible(), false);
    assert((await page.locator('#training-empty-title').textContent()).includes('No current positions'));
    assert.deepEqual(errors, []);
    await context.close();

    multiple = true;
    ({ context, page } = await start());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/listudy-train-queue-mobile.png', fullPage: true });
    assert((await page.locator('#hint-btn').boundingBox()).y < 844, 'Hints are visible beside the board without scrolling on mobile');
    assert.equal(await page.locator('#training-position-counter').textContent(), 'Position 1 of 3');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    assert.equal(entry(await stats(page)).attempts, 0, 'Skipping does not grade or credit a position');
    await page.getByRole('button', { name: 'Finish session', exact: true }).click();
    assert.equal(await page.locator('#training-summary-title').textContent(), 'Session saved');
    assert((await page.locator('#training-summary-result').textContent()).includes('0 practiced'));
    assert((await page.locator('#training-summary-result').textContent()).includes('3 not attempted'));
    await page.getByRole('button', { name: 'Practice remaining' }).click();
    await page.locator('.training-positions > summary').click();
    await page.getByRole('button', { name: 'Position 3: Not attempted', exact: true }).click();
    await page.getByRole('button', { name: 'Show answer', exact: true }).click();
    await page.locator('#next-mistake-btn').click();
    assert.equal(await page.locator('#training-summary-title').textContent(), 'Session saved', 'Jumping to the last position does not claim the queue was completed');
    assert((await page.locator('#training-summary-result').textContent()).includes('1 practiced'));
    assert((await page.locator('#training-summary-result').textContent()).includes('2 not attempted'));
    await page.getByRole('button', { name: 'Practice remaining' }).click();
    assert.equal(await page.locator('#training-position-counter').textContent(), 'Position 1 of 2');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'training-position-counter', 'Continuing restores keyboard focus to the new exercise');
    await context.close();
    multiple = false;

    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Amsterdam' });
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/analysis/games');
    assert.equal(await page.locator('.analysis-game-row').count(), 2);
    assert((await page.locator('.analysis-game-primary').first().textContent()).includes('vs Opponent'));
    assert((await page.locator('.analysis-game-primary').first().textContent()).includes('You as White'));
    assert((await page.locator('.analysis-game-result').first().textContent()).includes('Lost'));
    assert.equal(await page.getByLabel('Platform', { exact: true }).isVisible(), false);
    await page.locator('[data-game-filters-more] > summary').click();
    await page.getByLabel('Platform', { exact: true }).selectOption('lichess');
    await page.getByLabel('Study', { exact: true }).selectOption(String(source[0].study_id));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-game-filters-more]').getAttribute('open'), null);
    await page.getByLabel('Period', { exact: true }).selectOption('last_week');
    await page.getByLabel('Repertoire comparison', { exact: true }).selectOption('deviation');
    await page.getByRole('button', { name: 'Filter games', exact: true }).click();
    assert(page.url().includes('platform=lichess'));
    assert(page.url().includes('study_id=' + source[0].study_id));
    const comparison = await page.locator('.analysis-game-row').first().getAttribute('href');
    assert(comparison.includes('period=last_week') && comparison.includes('status=deviation'), 'Opening a comparison preserves its list filters');
    assert.equal(await page.getByRole('link', { name: 'Remove platform filter', exact: true }).count(), 1);
    for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.locator('[data-game-filters-more] > summary').click();
        const panel = await page.locator('.analysis-games-more-panel').boundingBox();
        assert(panel.x >= 0 && panel.x + panel.width <= width, 'Advanced filters stay within the screen');
        await page.keyboard.press('Escape');
        await page.screenshot({ path: '/tmp/listudy-games-new-' + width + '.png', fullPage: true });
    }
    await page.getByRole('link', { name: 'Reset filters', exact: true }).click();
    assert.equal(new URL(page.url()).search, '');
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Train recall, hints, corrections, answers, account sync, historical counts, Smart links and responsive layouts passed');
 } finally { await browser.close(); server.close(); }
})();
