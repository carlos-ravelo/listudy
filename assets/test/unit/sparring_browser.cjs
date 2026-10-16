const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const webpack = require('webpack');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'listudy-sparring-'));
const render = source => source.replace(/<%=\s*dgettext[^%]*%>/g,
    expression => expression.match(/"(?:\\.|[^"\\])*"/g)[1].slice(1, -1));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const infoBoxes = read('lib/listudy_web/templates/component/infoboxes.html.eex').replace(/<%[\s\S]*?%>/g, '');
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/static/css/chessground.css">
<link rel="stylesheet" href="/assets/css/features/chapter_editor.css">
<link rel="stylesheet" href="/assets/css/features/study_presentation.css">
<link rel="stylesheet" href="/assets/css/features/sparring.css">
<style>:root{--font-color:#222;--bg-color:#fff;--bg-highlight-color:#ddd;--study-divider:#bbb}.study-board-frame{width:min(500px,90vw)}#chessground{width:100%;height:auto;aspect-ratio:1}.hidden{display:none}</style></head><body>
<div class="study-workspace"><div class="study-session-controls"><button id="practice_sparring">Sparring</button><button id="practice_smart">Smart</button><button id="practice_lines">Lines</button></div>
<div class="study-primary-actions"><button id="hints">Hint</button><button id="reset_line">Reset line</button></div>
<div class="study-board-frame"><div id="chessground" class="cg-wrap" tabindex="-1"></div>
${render(read('lib/listudy_web/templates/component/promotion_picker.html.eex'))}</div>
${infoBoxes}
${render(read('lib/listudy_web/templates/study/_sparring.html.eex'))}</div>
<script>window.sound_enabled=true;window.sound_volume=0.5;window.playedSounds=[];
window.Audio=class {constructor(src){this.src=src}load(){}cloneNode(){return this}play(){playedSounds.push(this.src);return Promise.resolve()}};</script>
<script src="/bundle.js"></script><script>
window.engineTrace = [];
window.Worker = class extends Worker {
  constructor(url) { super(url); this.addEventListener('message', event => engineTrace.push(String(event.data))); }
  postMessage(message) { engineTrace.push('> ' + message); super.postMessage(message); }
};
window.chapter = {headers: {Event:'Test chapter'},root:[{move:'e4',children:[{move:'e5',children:[{move:'Nf3',children:[]}]}]}]};
window.savedResults={};window.decisions=[];window.stops=0;
window.board=Sparring.Chessground(document.getElementById('chessground'),{drawable:{brushes:{normal:{key:'n',color:'#3333ff',opacity:0.6,lineWidth:10}}},movable:{free:false,events:{after:(from,to)=>controller.move(from,to)}}});
window.controller=Sparring.setupStudySparring({getPlayer:()=> 'white',getChapter:()=>chapter,getBoard:()=>board,
 createEngine:()=>window.fakeEngine || Sparring.createSparringEngine(),
 showHints(){board.setShapes([{orig:'e2',dest:'e4',brush:'green'}])},onStop(){stops++},
 onDecision(record){decisions.push(record)},saveResult(record){savedResults[record.id]=record},getHistory:()=>Object.values(savedResults)});
document.getElementById('hints').onclick=()=>controller.hint();
document.getElementById('reset_line').onclick=()=>controller.start();
</script></body></html>`;
const fixtureEntry = path.join(temp, 'fixture.cjs');
fs.writeFileSync(fixtureEntry, `module.exports={...require(${JSON.stringify(path.join(root, 'assets/js/modules/sparring/study_adapter.js'))}),...require(${JSON.stringify(path.join(root, 'assets/js/modules/sparring/uci_engine.js'))}),Chessground:require(${JSON.stringify(path.join(root, 'assets/node_modules/chessground'))}).Chessground}`);

(async () => {
    await new Promise((resolve, reject) => webpack({ mode: 'development',
        context: path.join(root, 'assets'), entry: fixtureEntry,
        output: { path: temp, filename: 'bundle.js', library: 'Sparring' }
    }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString())) : resolve()));
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
        const file = pathname === '/bundle.js' ? path.join(temp, 'bundle.js')
            : pathname.startsWith('/stockfish/') ? path.join(root, 'assets/static', pathname)
            : path.join(root, pathname);
        if (!file.startsWith(root + path.sep) && !file.startsWith(temp + path.sep) || !fs.existsSync(file)) {
            response.statusCode = 404; response.end(); return;
        }
        response.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm'
            : file.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
            headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage({ acceptDownloads: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('requestfailed', request => errors.push(request.url() + ': ' + request.failure().errorText));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.click('#practice_sparring');
        await page.waitForSelector('cg-board piece');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.textContent('[data-sparring="status"]'), 'Training theory');
        assert.equal(await page.locator('cg-board').count(), 1);
        async function auditButtons() {
            const buttons = page.locator('#study_sparring button:visible, [data-promotion-picker]:visible button, #practice_sparring, #hints, #reset_line');
            await page.keyboard.press('Tab');
            for (let index = 0; index < await buttons.count(); index++) {
                const button = buttons.nth(index);
                const name = await button.getAttribute('aria-label') || await button.textContent();
                assert(name.trim(), 'Every button needs an accessible name');
                const bounds = await button.boundingBox();
                assert(bounds.width >= 43.9 && bounds.height >= 43.9, `${name}: target smaller than 44px`);
                assert(bounds.x >= 0 && bounds.x + bounds.width <= await page.evaluate(() => innerWidth) + 1, `${name}: overflows viewport`);
                if (await button.isEnabled()) {
                    await button.focus();
                    assert(await button.evaluate(element => getComputedStyle(element).outlineStyle !== 'none'), `${name}: missing keyboard focus`);
                }
            }
        }
        async function downloadPGN(button) {
            const pending = page.waitForEvent('download');
            await button.click();
            const download = await pending;
            assert.equal(download.suggestedFilename(), 'listudy-sparring.pgn');
            const pgn = fs.readFileSync(await download.path(), 'utf8');
            assert(pgn.includes('[Event "Test chapter"]'));
            assert(pgn.includes('1. e4 e5'));
        }
        await auditButtons();
        async function move(from, to) {
            const bounds = await page.locator('#chessground').boundingBox();
            for (const square of [from, to]) await page.mouse.click(
                bounds.x + (square.charCodeAt(0) - 97 + 0.5) * bounds.width / 8,
                bounds.y + (8 - Number(square[1]) + 0.5) * bounds.height / 8, { delay: 70 });
        }
        await move('d2', 'd4');
        await page.waitForFunction(() => document.getElementById('error_text').textContent.includes('Outside your repertoire'));
        await page.click('#hints');
        assert.equal(await page.evaluate(() => board.state.drawable.shapes[0].dest), 'e4');
        await move('e2', 'e4');
        await page.waitForFunction(() => board.state.pieces.get('e5')?.color === 'black');
        await move('g1', 'f3');
        await page.waitForFunction(() => /Free play|unavailable/.test(document.querySelector('[data-sparring="status"]').textContent),
            null, { timeout: 30000 });
        assert.equal(await page.textContent('[data-sparring="status"]'), 'Free play against Stockfish', await page.evaluate(() => engineTrace.slice(-12).join('; ')));
        assert((await page.evaluate(() => playedSounds.length)) >= 4);
        // Make a legal engine-phase decision, then review before the checkpoint.
        const next = await page.evaluate(() => {
            const [from, tos] = [...board.state.movable.dests][0]; return [from, tos[0]];
        });
        await move(...next);
        await page.waitForFunction(() => !document.querySelector('[data-sparring="analyze"]').disabled ||
            !document.querySelector('[data-sparring="summary"]').hidden, null, { timeout: 30000 });
        if (await page.locator('[data-sparring="summary"]').isHidden()) await page.click('[data-sparring="analyze"]');
        await page.waitForSelector('[data-sparring="summary"]', { state: 'visible' });
        assert.equal(await page.textContent('[data-sparring="theory-score"]'), '1/2');
        assert.equal(await page.textContent('[data-sparring="engine-score"]'), '1/1');
        assert.equal(await page.locator('[data-sparring="results"] tr').count(), 1);
        assert.equal(await page.evaluate(() => Object.keys(savedResults).length), 1);
        await auditButtons();
        await downloadPGN(page.locator('[data-sparring="download"]'));
        await page.locator('[data-sparring="history"] > summary').click();
        await page.locator('[data-sparring="recent"] details > summary').first().click();
        await downloadPGN(page.locator('[data-sparring="recent"] button').first());
        await page.locator('[data-sparring="results"] button').first().click();
        assert(await page.evaluate(() => board.state.drawable.shapes.length > 0));
        await page.locator('[data-sparring="results"] button').first().focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-ply')), true);
        await page.click('[data-sparring="continue"]');
        await page.waitForFunction(() => !document.querySelector('[data-sparring="analyze"]').disabled);
        assert.equal(await page.locator('[data-sparring="summary"]').isHidden(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'chessground');
        await page.click('[data-sparring="analyze"]');
        await page.click('[data-sparring="retry"]');
        assert.equal(await page.locator('[data-sparring="summary"]').isHidden(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'chessground');
        await page.click('[data-sparring="analyze"]');
        assert.equal(await page.textContent('[data-sparring="engine-score"]'), '1/1');
        page.once('dialog', dialog => dialog.dismiss());
        await page.click('[data-sparring="resign"]');
        assert.equal(await page.locator('[data-sparring="resign"]').isDisabled(), false);
        page.once('dialog', dialog => dialog.accept());
        await page.click('[data-sparring="resign"]');
        assert((await page.textContent('[data-sparring="outcome"]')).includes('0-1'));
        assert.equal(await page.locator('[data-sparring="resign"]').isDisabled(), true);
        assert.equal(await page.locator('[data-sparring="resign"]').isHidden(), true);
        await auditButtons();
        await page.click('[data-sparring="leave"]');
        assert.equal(await page.evaluate(() => stops), 1);
        assert.equal(await page.locator('cg-board').count(), 1);
        // Reuse the editor's promotion picker; cancel and underpromote.
        await page.setViewportSize({ width: 320, height: 844 });
        await page.evaluate(() => { chapter={headers:{FEN:'k7/7P/8/8/8/8/8/K7 w - - 0 1'},root:[{move:'h8=N',children:[]}]}; });
        await page.click('#practice_sparring');
        await move('h7', 'h8');
        await page.waitForSelector('[data-promotion-picker]', { state: 'visible' });
        await auditButtons();
        await page.locator('[data-promotion-cancel]').click();
        assert.equal(await page.locator('[data-promotion-picker]').isHidden(), true);
        await move('h7', 'h8');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-promotion-picker]').isHidden(), true);
        assert.equal(await page.evaluate(() => board.state.pieces.get('h7').role), 'pawn');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'chessground');
        await move('h7', 'h8');
        await page.click('[data-promotion="n"]');
        await page.waitForFunction(() => board.state.pieces.get('h8')?.role === 'knight');
        assert.equal(await page.textContent('[data-sparring="status"]'), 'Session finished');
        assert.equal(await page.locator('[data-sparring="summary"]').isVisible(), true);
        await auditButtons();
        // Theory exit, empty review and retrying an unavailable engine.
        await page.click('[data-sparring="leave"]');
        await page.evaluate(() => {
            chapter = { headers: {Event:'Test chapter'}, root: [{move:'e4',children:[]}] };
            fakeEngine = { async analyze() { throw new Error('offline'); }, async bestMove() { return 'e7e5'; }, cancel() {}, dispose() {} };
        });
        await page.click('#practice_sparring');
        await page.click('[data-sparring="continue"]');
        assert.equal(await page.textContent('[data-sparring="status"]'), 'Free play against Stockfish');
        await page.click('[data-sparring="analyze"]');
        assert.equal(await page.locator('[data-sparring="empty-analysis"]').isVisible(), true);
        assert.equal(await page.locator('[data-sparring="download"]').isDisabled(), true);
        await page.click('[data-sparring="continue"]');
        await move('e2', 'e4');
        await page.waitForFunction(() => document.querySelector('[data-sparring="continue"]').textContent === 'Retry Stockfish');
        await auditButtons();
        await page.click('[data-sparring="continue"]');
        await page.waitForFunction(() => board.state.pieces.get('e5')?.color === 'black');
        await page.click('[data-sparring="analyze"]');
        assert((await page.textContent('[data-sparring="coverage"]')).includes('unavailable'));
        await page.setViewportSize({ width: 390, height: 844 });
        const dimensions = await page.locator('#chessground').boundingBox();
        assert(Math.abs(dimensions.width - dimensions.height) < 2);
        assert(dimensions.x >= 0 && dimensions.x + dimensions.width <= 390);
        assert.deepEqual(errors, []);
        console.log('All Sparring buttons: labels, keyboard focus, touch targets, continue, retry, downloads, history, resignation and promotion passed');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
