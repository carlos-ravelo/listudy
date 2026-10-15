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
const decode = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const key = train.match(/data-study-key="([^"]+)"/)[1] + '_chapter_stats';
const source = JSON.parse(decode(train.match(/data-mistakes="([^"]+)"/)[1]));
let cloud = {}, revisions = {}, stale = false;
const errors = [];
(async () => {
 const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    if (url.pathname === '/api/progress') return json({ ...cloud, _progress_revisions: revisions });
    if (url.pathname === '/api/progress/sync') {
        let body = ''; for await (const chunk of req) body += chunk;
        const data = JSON.parse(body); cloud[data.key] = data.value;
        revisions[data.key] = String(Number(revisions[data.key] || 0) + 1);
        return json({ revision: revisions[data.key] });
    }
    if (/\/analysis\/studies\/\d+\/positions/.test(url.pathname)) return json({ positions: source });
    if (url.pathname.includes('/new-games/')) return json({ status: 'current' });
    if (url.pathname === '/analysis' || url.pathname === '/train' || url.pathname.startsWith('/en/studies/')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        const raw = url.pathname === '/analysis' ? overview : url.pathname === '/train' ? train : study;
        const body = raw.replace('</head>', '<style>' + fs.readFileSync(path.join(root, 'assets/css/features/analysis_presentation.css'), 'utf8') + '</style></head>');
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
        cloud = {}; revisions = {}; stale = false;
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/train'); await page.waitForSelector('cg-board');
        return { context, page };
    };
    const stats = page => page.evaluate(key => {
        const entry = Object.keys(localStorage).find(value => value.startsWith('progress:user:') && value.endsWith(':' + key));
        return JSON.parse(localStorage.getItem(entry));
    }, key);
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
    assert((await page.locator('#training-progress-status').textContent()).includes('0 to review now'));
    assert.equal(entry(saved).coveredMoves.length, 1);
    assert.equal(Object.values(saved.studySessions)[0].reviewCount, 1);
    await page.getByRole('button', { name: 'Next Position' }).click();
    assert.equal(await page.locator('#training-status').textContent(), 'Session complete');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    for (let tries = 0; tries < 100 && !cloud[key]; tries++) await page.waitForTimeout(20);
    assert(cloud[key], 'Practice is synchronized to the account');
    await page.goto(base + '/analysis');
    await page.waitForFunction(() => document.querySelector('[data-game-review-status]')?.textContent === 'Reviews scheduled');
    assert((await page.locator('[data-repertoire-row]').textContent()).includes('2 / 2 games with deviations'));
    for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overview fits ${width}px`);
    }
    await page.screenshot({ path: '/tmp/listudy-analysis-new-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/listudy-analysis-new-mobile.png', fullPage: true });
    await page.goto(base + '/train'); await page.waitForSelector('cg-board');
    assert.equal(card(await stats(page)).gameEvidence.pending, false, 'Reload does not reopen the same game observation');
    await page.goto(base + lineUrl);
    await page.waitForFunction(() => document.getElementById('practice_smart')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('#smart_run_status').isVisible(), true);
    assert.equal(await page.evaluate(() => window.curr_move.length), 1, 'Practice line starts at the chapter lead-in rather than an unrelated Smart prompt');
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.screenshot({ path: '/tmp/listudy-analysis-line.png', fullPage: true });
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
    await page.waitForFunction(() => document.getElementById('training-status').textContent === 'Incorrect!');
    await page.waitForFunction(() => document.getElementById('training-status').textContent === 'Position 1 of 1');
    await play(page, 'g1', 'f3');
    await page.waitForFunction(() => document.getElementById('training-status').textContent.includes('another review'));
    saved = await stats(page);
    assert.equal(card(saved).history.length, 1, 'A correction does not add a second graded review');
    assert.equal(Object.values(saved.studySessions)[0].reviewCount, 1);
    await context.close();

    ({ context, page } = await start());
    await page.getByRole('button', { name: 'Show Answer' }).click();
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
    assert((await page.locator('#training-progress-status').textContent()).includes('No current positions'));
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Train recall, hints, corrections, answers, account sync, historical counts, Smart links and responsive layouts passed');
 } finally { await browser.close(); server.close(); }
})();
