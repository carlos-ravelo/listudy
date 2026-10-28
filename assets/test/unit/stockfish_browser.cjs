const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const translate = source => source.replace(/<%=\s*dgettext[^%]*%>/g, expression => expression.match(/"(?:\\.|[^"\\])*"/g)[1].slice(1, -1));
const frame = read('lib/listudy_web/templates/page/play_stockfish.html.eex').match(/<div class="stockfish-board-frame">[\s\S]*?<\/div>/)[0]
    .replace('<%= render ListudyWeb.ComponentView, "chessground.html" %>', translate(read('lib/listudy_web/templates/component/chessground.html.eex')))
    .replace('<%= render ListudyWeb.ComponentView, "promotion_picker.html" %>', translate(read('lib/listudy_web/templates/component/promotion_picker.html.eex')));
const html = `<!doctype html><html class="blue cburnett"><head><link rel="stylesheet" href="/css/bootstrap_site.css"><link rel="stylesheet" href="/css/chessground.css">
<style>#game_container{width:min(420px,90vw)}</style></head><body class="bootstrap-ui">
<div id="game_container">${frame}</div><button id="reset_white">White</button><button id="reset_black">Black</button><button id="takeback">Takeback</button>
<div id="progress"></div><span id="progress_reason"></span>
<script>
window.workers=[];window.sound_enabled=false;window.sound_volume=1;
window.Audio=class{load(){}cloneNode(){return this}play(){return Promise.resolve()}};
window.Worker=class{
 constructor(){workers.push(this);this.commands=[]}
 postMessage(command){this.commands.push(command);if(command==='uci'||command==='isready')queueMicrotask(()=>{if(!this.stopped)this.onmessage?.({data:command==='uci'?'uciok':'readyok'})})}
 terminate(){this.stopped=true}
};
</script><script src="/js/play_stockfish.js"></script></body></html>`;
(async () => {
    let server, browser;
    try {
        server = http.createServer((request, response) => {
            const pathname = new URL(request.url, 'http://localhost').pathname;
            if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
            const file = path.resolve(root, 'priv/static', '.' + pathname);
            if (!file.startsWith(root + '/priv/static/') || !fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
            response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'image/svg+xml');
            response.end(fs.readFileSync(file));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const base = `http://127.0.0.1:${server.address().port}/`;
        const picker = page.locator('[data-promotion-picker]');
        async function load(fen) {
            await page.goto(base + '#' + fen + ';p');
            await page.reload();
            await page.waitForFunction(() => window.ground && window.chess, null, { timeout: 5000 }).catch(error => { throw new Error(error.message + '\nPage errors: ' + errors.join('; ')); });
        }
        async function promote(from, to) {
            await page.evaluate(([from, to]) => { ground.move(from, to); ground.state.movable.events.after(from, to); }, [from, to]);
            await picker.waitFor({ state: 'visible' });
        }
        for (const [fen, from, to, color] of [
            ['4k2r/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7', 'a8', 'white'],
            ['4k3/8/8/8/8/8/p7/4K2R b - - 0 1', 'a2', 'a1', 'black']
        ]) for (const role of ['q', 'r', 'b', 'n']) {
            await load(fen);
            await promote(from, to);
            assert.equal(await page.evaluate(() => chess.history().length), 0);
            assert.equal(await page.evaluate(() => ground.state.movable.dests.size), 0);
            assert.equal(await page.evaluate(() => workers.length), 0, 'Do not start Stockfish before the choice');
            const overlay = await picker.boundingBox(), board = await page.locator('#chessground').boundingBox();
            assert(Math.abs(overlay.width - board.width) < 2 && Math.abs(overlay.height - board.height) < 2, 'Overlay covers the board');
            assert(await picker.locator(`piece.${color}`).count() === 4);
            const choice = picker.locator(`[data-promotion="${role}"]`);
            const box = await choice.boundingBox();
            assert(box.width >= 44 && box.height >= 44, 'Usable promotion choices with the real page stylesheet');
            await choice.click();
            await picker.waitFor({ state: 'hidden' });
            await page.waitForFunction(() => workers.some(worker => worker.commands.some(command => command.startsWith('go '))), null, { timeout: 5000 }).catch(error => { throw new Error(error.message + '\nPage errors: ' + errors.join('; ')); });
            assert.equal(await page.evaluate(square => chess.get(square).type, to), role);
            assert.equal(await page.evaluate(() => workers.flatMap(worker => worker.commands).filter(command => command.startsWith('go ')).length), 1);
        }
        const fen = '4k2r/P7/8/8/8/8/8/4K3 w - - 0 1';
        await load(fen); await promote('a7', 'a8');
        await page.keyboard.press('Escape');
        assert(await picker.isHidden());
        assert.equal(await page.evaluate(() => chess.fen()), fen);
        assert.equal(await page.evaluate(() => ground.state.movable.color), 'white');
        await promote('a7', 'a8');
        await picker.locator('[data-promotion-cancel]').click();
        assert(await picker.isHidden());
        assert.equal(await page.evaluate(() => workers.length), 0);
        await promote('a7', 'a8');
        await page.click('#takeback');
        assert(await picker.isHidden());
        await promote('a7', 'a8');
        await page.click('#reset_white');
        assert(await picker.isHidden());
        assert.equal(await page.evaluate(() => chess.history().length), 0);
        await load(fen); await promote('a7', 'a8');
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
        assert(await picker.isHidden());
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
        assert.equal(await page.evaluate(() => ground.state.movable.color), 'white');
        assert.deepEqual(errors, []);
        console.log('Stockfish browser: both colors/all promotion choices, real CSS, cancellation, reset, takeback and cached return passed');
    } finally {
        await browser?.close();
        if (server) await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
