const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({require, setTimeout, clearTimeout, stockfishVersion: '19.0.1'});
for (const name of ['evaluation', 'session', 'chess_adapter', 'uci_engine']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../../js/modules/sparring/${name}.js`), 'utf8')
        .replace(/^import .*\n/gm, '').replace(/^export /gm, ''), context);
}
const {createSparringEngine, createSparringSession, createChapterSparring} = context;
const state = {initialFen: 'start', moves: []};
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
    const workers = [];
    const engine = createSparringEngine({createWorker() {
        const worker = {
            messages: [], terminated: false,
            terminate() { this.terminated = true; },
            emit(data) { this.onmessage({data}); },
            postMessage(message) {
                this.messages.push(message);
                if (message === 'uci') queueMicrotask(() => {
                    this.emit('option name UCI_Elo type spin default 1320 min 1320 max 3190');
                    this.emit('uciok');
                });
                if (message === 'isready') queueMicrotask(() => this.emit('readyok'));
            },
            complete(depth = 18, cp = 0) {
                this.emit(`info depth ${depth} score cp ${cp} pv e2e4 e7e5`);
                this.emit('bestmove e2e4');
            }
        };
        workers.push(worker);
        return worker;
    }});
    return {engine, workers};
}
(async () => {
    const {engine, workers} = harness();
    let job = engine.analyze(state);
    await tick();
    const worker = workers[0];
    assert.equal(worker.messages.at(-1), 'go depth 18');
    worker.complete();
    assert.equal((await job).targetReached, true);
    job = engine.analyze(state, {targetDepth: 20});
    await tick();
    assert.equal(worker.messages.at(-1), 'go depth 20');
    worker.complete(20);
    await job;
    assert.equal(workers.length, 1);
    assert(!worker.messages.some(line => /ucinewgame|Clear Hash/.test(line)));

    job = engine.analyze(state, {maxTimeMs: 10});
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(worker.messages.at(-1), 'stop');
    worker.complete(9);
    const incomplete = await job;
    assert.equal(incomplete.targetReached, false);
    assert.equal(incomplete.timedOut, true);
    assert.equal(worker.terminated, false);
    job = engine.analyze(state, {maxTimeMs: 10});
    await tick();
    assert.equal(worker.messages.at(-1), 'go depth 18', 'Incomplete results must not be cached');
    worker.complete();
    await job;

    job = engine.analyze({...state, moves: ['e2e4']});
    const cancelled = assert.rejects(job, /cancelled/);
    await tick();
    engine.cancel();
    const count = worker.messages.filter(line => line.startsWith('go')).length;
    const next = engine.analyze({...state, moves: ['d2d4']});
    await tick();
    assert.equal(worker.messages.filter(line => line.startsWith('go')).length, count);
    worker.complete(2, 999);
    await cancelled;
    await tick();
    assert.equal(worker.messages.filter(line => line.startsWith('go')).length, count + 1);
    worker.complete(18, 33);
    assert.equal((await next).score.value, 33);
    assert.equal(workers.length, 1);
    assert.equal(worker.terminated, false);
    engine.dispose();
    assert.equal(worker.terminated, true);

    const stuck = harness();
    await assert.rejects(stuck.engine.analyze(state, {maxTimeMs: 5}), /stop timeout/);
    assert.equal(stuck.workers[0].terminated, true);
    const recovered = stuck.engine.analyze(state);
    await tick();
    stuck.workers[1].complete();
    assert.equal((await recovered).targetReached, true);
    stuck.engine.dispose();

    const initializing = harness();
    const beforeReady = initializing.engine.analyze(state);
    initializing.engine.cancel();
    await assert.rejects(beforeReady, /cancelled/);
    const resumed = initializing.engine.analyze(state);
    await tick();
    initializing.workers[0].complete();
    assert.equal((await resumed).targetReached, true);
    assert.equal(initializing.workers.length, 1);
    initializing.engine.dispose();

    for (const mode of ['incomplete-before', 'incomplete-after', 'incomplete-confirmation', 'changed-grade']) {
        const decisions = [];
        let calls = 0;
        const session = createSparringSession({
            ...createChapterSparring({headers: {}, root: []}), player: 'w', pauseOnBlunder: true,
            onDecision: decision => decisions.push(decision),
            engine: {
                async analyze(position, policy) {
                    calls++;
                    assert.equal(policy.maxTimeMs, 4000);
                    assert.equal(policy.targetDepth, calls <= 2 ? 18 : 20);
                    const incomplete = mode === 'incomplete-before' && calls === 1 ||
                        mode === 'incomplete-after' && calls === 2 ||
                        mode === 'incomplete-confirmation' && calls === 3;
                    return {targetReached: !incomplete, depth: incomplete ? 9 : policy.targetDepth,
                        score: {type: 'cp', value: mode === 'changed-grade' && calls > 2 ? 0 : position.turn === 'w' ? 500 : 0},
                        uci: position.turn === 'w' ? 'd2d4' : 'e7e5', pv: []};
                },
                async bestMove() { return 'e7e5'; }, canReuseAnalysisMove: () => false,
                cancel() {}, dispose() {}
            }
        });
        await session.start();
        await session.move('e2e4');
        assert.equal(session.snapshot().reviews.length, 0, mode);
        assert.equal(decisions.length, 0, mode);
        assert.equal(session.snapshot().freeCount, 1);
        assert.equal(session.snapshot().error, null);
        assert.equal(session.snapshot().phase, 'free');
        assert.equal(session.snapshot().canPlay, true);
        session.dispose();
    }
    console.log('Sparring analysis policy tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
