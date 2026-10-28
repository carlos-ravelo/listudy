const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({setTimeout, clearTimeout, stockfishVersion: '19.0.1'});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/engine/uci_engine.js'), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/^export /gm, ''), context);
const {engineHashMb, createSparringEngine} = context;
const state = {initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: []};
function setup(memory, hash = 'option name Hash type spin default 16 min 1 max 256') {
    const logs = [];
    const engine = createSparringEngine({deviceMemory: memory, strength: 8, createWorker() {
        const commands = []; logs.push(commands);
        const worker = {terminate() {}, postMessage(command) {
            commands.push(command);
            if (command === 'uci') queueMicrotask(() => {
                if (hash) worker.onmessage({data: hash});
                worker.onmessage({data: 'uciok'});
            });
            if (command === 'isready') queueMicrotask(() => worker.onmessage({data: 'readyok'}));
            if (command.startsWith('go ')) queueMicrotask(() => worker.onmessage({data: 'bestmove e2e4'}));
        }};
        return worker;
    }});
    return {engine, logs};
}
(async () => {
    for (const [hint, expected] of [[undefined,16], [null,16], [NaN,16], [Infinity,16], ['1',16], [0,16], [-1,16], [.5,4], [1,4], [2,8], [4,16], [32,16]]) assert.equal(engineHashMb(hint), expected);
    const small = setup(1);
    await small.engine.analyze(state); await small.engine.bestMove(state);
    assert.equal(small.logs.length, 2);
    for (const log of small.logs) {
        assert(log.includes('setoption name Hash value 4'));
        assert(log.indexOf('setoption name Hash value 4') < log.indexOf('isready'), 'Memory configuration finishes before the first search');
    }
    small.engine.cancel(); await small.engine.bestMove(state);
    assert.equal(small.logs.length, 2, 'Cancelling an idle search keeps initialized workers');
    assert.equal(small.logs[1].filter(command => command.startsWith('go ')).length, 2, 'The configured opponent accepts another search');
    small.engine.dispose();
    for (const hint of [undefined, 8]) {
        const normal = setup(hint); await normal.engine.bestMove(state);
        assert(!normal.logs[0].some(command => command.startsWith('setoption name Hash')));
        normal.engine.dispose();
    }
    const clamped = setup(1, 'option name Hash type spin default 16 min 8 max 64');
    await clamped.engine.bestMove(state); assert(clamped.logs[0].includes('setoption name Hash value 8')); clamped.engine.dispose();
    for (const capability of ['', 'option name Hash type spin default 16 min 32 max 8']) {
        const unknown = setup(1, capability); await unknown.engine.bestMove(state);
        assert(!unknown.logs[0].some(command => command.startsWith('setoption name Hash')));
        unknown.engine.dispose();
    }
    console.log('Conservative per-worker memory budgets, capability negotiation, defaults and restart checks passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
