const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const webpack = require('webpack');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'listudy-board-game-'));
const entry = path.join(temp, 'entry.cjs');
fs.writeFileSync(entry, `module.exports={...require(${JSON.stringify(path.join(root, 'assets/js/modules/board/board_game.js'))}),
...require(${JSON.stringify(path.join(root, 'assets/js/modules/training/line_exercise.js'))}),
...require(${JSON.stringify(path.join(root, 'assets/js/modules/training/training_lifecycle.js'))}),
Chessground:require(${JSON.stringify(path.join(root, 'assets/node_modules/chessground'))}).Chessground,
Chess:require(${JSON.stringify(path.join(root, 'assets/node_modules/chess.js'))})};`);
const html = `<!doctype html><link rel="stylesheet" href="/board.css"><style>#board{width:320px;height:320px}</style>
<div id="board" class="cg-wrap"></div><script src="/bundle.js"></script>`;

(async () => {
    let browser, server;
    try {
        await new Promise((resolve, reject) => webpack({ mode: 'development', entry,
            output: { path: temp, filename: 'bundle.js', library: 'Fixture' }
        }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString())) : resolve()));
        server = http.createServer((request, response) => {
            if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
            const file = request.url === '/bundle.js' ? path.join(temp, 'bundle.js')
                : request.url === '/board.css' ? path.join(root, 'assets/static/css/chessground.css') : null;
            if (!file) { response.statusCode = 404; response.end(); return; }
            response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
            response.end(fs.readFileSync(file));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        for (const [fen, moves] of [
            ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e7e5']],
            ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1', 'e8c8']],
            ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['e5d6', 'e8d7']],
            ['4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', ['e4d5', 'e8d7']],
            ...['q', 'r', 'b', 'n'].map(role => ['7k/P7/8/8/8/8/8/7K w - - 0 1', ['a7a8' + role]])
        ]) {
            await page.evaluate(fen => {
                window.ground?.destroy();
                window.position = new Fixture.Chess(fen);
                window.effects = [];
                window.ground = Fixture.Chessground(document.getElementById('board'), { movable: {
                    free: false, showDests: false, events: { after: (from, to) => game.play({ from, to, promotion: 'q' }) }
                } });
                window.game = Fixture.createBoardGame({ getBoard: () => ground, getPosition: () => position,
                    onMove: move => effects.push(move.san) });
                game.restore();
            }, fen);
            const assertSynchronized = async () => assert.equal(await page.evaluate(() => {
                const roles = { p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' };
                const expected = position.SQUARES.flatMap(square => {
                    const piece = position.get(square);
                    return piece ? [[square, roles[piece.type], piece.color === 'w' ? 'white' : 'black']] : [];
                });
                const actual = [...ground.state.pieces].map(([square, piece]) => [square, piece.role, piece.color]);
                return JSON.stringify(expected.sort()) === JSON.stringify(actual.sort());
            }), true);
            for (const move of moves) {
                await page.evaluate(move => game.play(move), move);
                await assertSynchronized();
            }
            await page.evaluate(count => game.undo(count), moves.length);
            await assertSynchronized();
            assert.equal(await page.evaluate(() => position.fen()), fen);
            assert.equal(await page.evaluate(() => effects.length), moves.length);
            assert.equal(await page.evaluate(() => ground.state.movable.showDests), false);
        }
        await page.evaluate(() => {
            position = new Fixture.Chess(); game.restore();
            ground.selectSquare('e2'); ground.selectSquare('e4');
        });
        await page.waitForFunction(() => position.history().join(' ') === 'e4');
        assert.equal(await page.evaluate(() => ground.state.pieces.get('e4')?.role), 'pawn');
        assert.equal(await page.evaluate(() => ground.state.pieces.has('e2')), false);
        await page.evaluate(() => {
            position = new Fixture.Chess();
            window.lineDecisions = [];
            window.exercise = Fixture.createLineExercise({ getPosition: () => position,
                applyMove: uci => game.play(uci, { playable: false }),
                validator: { validate: async () => ({status: 'accepted', line: ['d2d4', 'd7d5', 'c2c4']}) }
            });
            exercise.reset({initialFen: position.fen(), moves: ['e4', 'e5', 'Nf3'], format: 'san'});
            game.restore();
            ground.set({movable: {events: {after: async (from, to) => {
                const result = await exercise.play({from, to}, {onPlayerMove: move => lineDecisions.push(move.san)});
                if (result) game.restore({playable: !result.complete});
            }}}});
            ground.selectSquare('d2'); ground.selectSquare('d4');
        });
        await page.waitForFunction(() => position.history().join(' ') === 'd4 d5');
        assert.equal(await page.evaluate(() => exercise.remaining.join(' ')), 'c2c4');
        await page.evaluate(() => { ground.selectSquare('c2'); ground.selectSquare('c4'); });
        await page.waitForFunction(() => exercise.complete);
        assert.deepEqual(await page.evaluate(() => lineDecisions), ['d4', 'c4']);
        assert.equal(await page.evaluate(() => ground.state.pieces.get('c4')?.role), 'pawn');
        await page.evaluate(() => {
            position = new Fixture.Chess();
            exercise.reset({initialFen: position.fen(), moves: ['e4', 'e5', 'Nf3'], format: 'san'});
            game.restore();
            window.waitingReply = exercise.play('e4', {beforeReply: () => new Promise(resolve => { window.releaseReply = resolve; })});
            position = new Fixture.Chess();
            exercise.reset({initialFen: position.fen(), moves: ['d4'], format: 'san'});
            game.restore();
            releaseReply();
        });
        assert.equal(await page.evaluate(() => waitingReply), null);
        assert.equal(await page.evaluate(() => position.history().length), 0);
        assert.equal(await page.evaluate(() => ground.state.pieces.has('e5')), false);
        await page.evaluate(() => {
            ground.destroy();
            window.mounts = 0; window.staleInputs = 0; window.pageCleanups = 0;
            window.lifecycle = Fixture.createTrainingLifecycle({restore: () => mount()});
            lifecycle.page.use(() => pageCleanups++);
            window.mount = () => {
                mounts++;
                const scope = lifecycle.reset();
                position = new Fixture.Chess();
                ground = scope.use(Fixture.Chessground(document.getElementById('board'), {
                    movable: {events: {after: scope.guard(() => { staleInputs++; })}}
                }));
                scope.use(() => exercise.stop());
                exercise.reset({initialFen: position.fen(), moves: ['e4', 'e5', 'Nf3'], format: 'san'});
                game.restore();
            };
            mount();
            window.oldInput = ground.state.movable.events.after;
            window.cancelledReply = exercise.play('e4', {beforeReply: () => lifecycle.run.sleep(10000)});
            window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted: true}));
            oldInput('e2', 'e4');
            window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}));
        });
        assert.equal(await page.evaluate(() => cancelledReply), null);
        assert.equal(await page.evaluate(() => position.history().length), 0);
        assert.equal(await page.evaluate(() => mounts), 2);
        assert.equal(await page.evaluate(() => staleInputs), 0);
        await page.evaluate(() => {
            lifecycle.destroy();
            window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}));
        });
        assert.equal(await page.evaluate(() => mounts), 2);
        assert.equal(await page.evaluate(() => pageCleanups), 1);
        assert.deepEqual(errors, []);
        console.log('Shared board/session browser: optimistic input, special moves, undo, alternatives, restart and cached-page lifecycle passed');
    } finally {
        if (browser) await browser.close();
        if (server?.listening) await new Promise(resolve => server.close(resolve));
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
