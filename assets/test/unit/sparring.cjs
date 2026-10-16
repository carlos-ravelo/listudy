const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ require, setTimeout, clearTimeout });
for (const file of ['evaluation', 'session', 'chess_adapter', 'uci_engine']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../../js/modules/sparring/${file}.js`), 'utf8')
        .replace(/^import .*\n/gm, '').replace(/^export /gm, ''), context);
}
const { createSparringSession, createChapterSparring, createSparringEngine } = context;
const chapter = { headers: {}, root: [{ move: 'e4', children: [
    { move: 'e5', children: [{ move: 'Nf3', children: [] }] },
    { move: 'c5', children: [] }
] }] };
const plain = value => JSON.parse(JSON.stringify(value));
function make({ source = chapter, player = 'w', random = () => 0, bestMove = async () => 'b8c6' } = {}) {
    const ports = createChapterSparring(source);
    const calls = [];
    let disposed = false;
    const session = createSparringSession({ ...ports, player, random,
        engine: { async bestMove(state) { calls.push(plain(state)); return bestMove(state); }, dispose() { disposed = true; } } });
    return { session, calls, get disposed() { return disposed; } };
}
(async () => {
    const original = JSON.stringify(chapter);
    const { session, calls } = make();
    await session.start();
    const initial = session.snapshot().fen;
    assert.equal(await session.move('e2e5'), false);
    assert.equal(session.snapshot().attempts, 0);
    assert.equal(await session.move('d2d4'), false);
    assert.equal(session.snapshot().fen, initial);
    assert.equal(session.snapshot().feedback, 'outside');
    assert.equal(session.snapshot().attempts, 1);
    assert.equal(await session.move('e2e4'), true);
    assert.deepEqual(plain(session.snapshot().moves), ['e2e4', 'e7e5']);
    assert.equal(session.snapshot().correct, 0);
    assert.equal(session.snapshot().phase, 'theory');
    await session.move('g1f3');
    assert.equal(session.snapshot().phase, 'free');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].moves, ['e2e4', 'e7e5', 'g1f3']);
    assert.equal(session.snapshot().correct, 1);
    assert.equal(JSON.stringify(chapter), original);

    const black = make({ player: 'b' });
    await black.session.start();
    assert.deepEqual(plain(black.session.snapshot().moves), ['e2e4']);
    assert.equal(black.session.snapshot().canPlay, true);
    black.session.hint();
    await black.session.move('e7e5');
    assert.equal(black.session.snapshot().correct, 0);
    assert.equal(black.session.snapshot().phase, 'free');
    assert.equal(black.calls.length, 0);

    const alternate = make({ random: () => 0.99 });
    await alternate.session.start();
    await alternate.session.move('e2e4');
    assert.deepEqual(plain(alternate.session.snapshot().moves), ['e2e4', 'c7c5']);
    assert.equal(alternate.session.snapshot().phase, 'free');

    const promotion = make({ source: { headers: { FEN: '7k/P7/8/8/8/8/8/7K w - - 0 1' },
        root: [{ move: 'a8=N', children: [] }] } });
    await promotion.session.start();
    assert.equal(await promotion.session.move('a7a8n'), true);
    assert.equal(promotion.session.snapshot().phase, 'finished');
    assert.equal(promotion.calls.length, 0);

    let release;
    const late = make({ source: { headers: {}, root: [] }, bestMove: () => new Promise(resolve => { release = resolve; }) });
    await late.session.start();
    const pending = late.session.move('e2e4');
    assert.equal(late.session.snapshot().thinking, true);
    assert.equal(await late.session.move('d2d4'), false);
    late.session.dispose();
    release('e7e5');
    await pending;
    assert.equal(late.disposed, true);
    assert.deepEqual(plain(late.session.snapshot().moves), ['e2e4']);

    let fails = true;
    const retry = make({ source: { headers: {}, root: [] }, bestMove: async () => {
        if (fails) throw new Error('offline');
        return 'e7e5';
    } });
    await retry.session.start();
    await retry.session.move('e2e4');
    assert.equal(retry.session.snapshot().error, 'opponent');
    fails = false;
    await retry.session.continueWithEngine();
    assert.equal(retry.session.snapshot().error, null);
    assert.equal(retry.session.snapshot().canPlay, true);

    const messages = [];
    let worker;
    const engine = createSparringEngine({ createWorker() {
        worker = { terminate() { this.stopped = true; }, postMessage(message) {
            messages.push(message);
            const reply = message === 'uci' ? 'uciok' : message === 'isready' ? 'readyok'
                : message.startsWith('go ') ? 'bestmove e7e5 ponder g1f3' : null;
            if (reply) queueMicrotask(() => worker.onmessage({ data: reply }));
        } };
        return worker;
    } });
    assert.equal(await engine.bestMove({ initialFen: initial, moves: ['e2e4'] }), 'e7e5');
    assert(messages.indexOf('uci') < messages.indexOf('isready'));
    assert(messages.includes(`position fen ${initial} moves e2e4`));
    engine.dispose();
    assert.equal(worker.stopped, true);
    await assert.rejects(engine.bestMove({ initialFen: initial, moves: [] }), /disposed/);

    let deadWorker;
    const waitingEngine = createSparringEngine({ createWorker() {
        deadWorker = { terminate() {}, postMessage() {} }; return deadWorker;
    } });
    const waiting = waitingEngine.bestMove({ initialFen: initial, moves: [] });
    waitingEngine.dispose();
    await assert.rejects(waiting, /disposed/);

    const timedOut = createSparringEngine({ timeoutMs: 5, createWorker: () => ({ terminate() {}, postMessage() {} }) });
    await assert.rejects(timedOut.bestMove({ initialFen: initial, moves: [] }), /timeout/);
    timedOut.dispose();
    const { winningChances, assessMove } = context;
    assert.equal(winningChances({ type: 'mate', value: 0 }, 'b', 'w'), 100);
    assert.equal(winningChances({ type: 'mate', value: 0 }, 'w', 'w'), 0);
    assert.equal(assessMove({ score: { type: 'cp', value: 100 }, turn: 'b' },
        { score: { type: 'cp', value: -100 }, turn: 'w' }, 'b').loss, 0);

    const decisions = [];
    const analyzed = createSparringSession({ ...createChapterSparring({ headers: {}, root: [] }), player: 'w',
        checkpointEvery: 1, onDecision: result => decisions.push(result), engine: {
            async analyze(state) { return { score: { type: 'cp', value: state.turn === 'w' ? 100 : 0 },
                uci: state.turn === 'w' ? 'd2d4' : 'e7e5', pv: state.turn === 'w' ? ['d2d4', 'd7d5'] : ['e7e5'] }; },
            bestMove() { throw new Error('The analyzed response should be reused'); }, cancel() {}, dispose() {}
        } });
    await analyzed.start();
    await analyzed.move('e2e4');
    assert.equal(analyzed.snapshot().phase, 'review');
    assert.equal(analyzed.snapshot().reason, 'checkpoint');
    assert.equal(analyzed.snapshot().reviews[0].grade, 'inaccuracy');
    assert.deepEqual(plain(analyzed.snapshot().moves), ['e2e4', 'e7e5']);
    assert.equal(decisions.length, 1);
    assert.equal(await analyzed.move('g1f3'), false);
    await analyzed.continueWithEngine();
    assert.equal(analyzed.snapshot().canPlay, true);
    analyzed.analyzeHere();
    analyzed.retry();
    assert.deepEqual(plain(analyzed.snapshot().moves), []);
    assert.equal(analyzed.snapshot().freeCount, 1);
    await analyzed.move('e2e4');
    assert.equal(analyzed.snapshot().reviews[1].assisted, true);
    assert.equal(analyzed.snapshot().reviews.filter(row => !row.assisted).length, 1);
    assert.equal(analyzed.snapshot().freeCount, 1);
    analyzed.resign();
    assert.equal(analyzed.snapshot().phase, 'finished');
    assert.equal(analyzed.snapshot().reason, 'resigned');
    await analyzed.continueWithEngine();
    assert.equal(analyzed.snapshot().phase, 'finished');

    let searches = 0;
    const blunder = createSparringSession({ ...createChapterSparring({ headers: {}, root: [] }), player: 'w', engine: {
        async analyze(state) { searches++; return { score: { type: 'cp', value: state.turn === 'w' ? 500 : 0 },
            uci: state.turn === 'w' ? 'd2d4' : 'e7e5', pv: ['d2d4'] }; },
        cancel() {}, dispose() {}
    } });
    await blunder.start(); await blunder.move('e2e4');
    assert.equal(searches, 4);
    assert.equal(blunder.snapshot().reason, 'blunder');
    assert.deepEqual(plain(blunder.snapshot().moves), ['e2e4']);

    let resolveAnalysis;
    let cancelled = false;
    const resignThinking = createSparringSession({ ...createChapterSparring({ headers: {}, root: [] }), player: 'w', engine: {
        analyze() { return new Promise(resolve => { resolveAnalysis = resolve; }); },
        cancel() { cancelled = true; }, dispose() {}
    } });
    await resignThinking.start();
    const analysis = resignThinking.move('e2e4');
    resignThinking.resign();
    resolveAnalysis({ score: { type: 'cp', value: 0 } });
    await analysis;
    assert.equal(cancelled, true);
    assert.equal(resignThinking.snapshot().reason, 'resigned');
    assert.equal(resignThinking.snapshot().reviews.length, 0);
    console.log('Sparring session, evaluation, checkpoints, retries, cancellation and UCI tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
