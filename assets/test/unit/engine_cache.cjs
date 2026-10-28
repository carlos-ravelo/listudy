const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({setTimeout, clearTimeout, stockfishVersion: '19.0.1'});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/sparring/uci_engine.js'), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/^export /gm, ''), context);
const initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
(async () => {
    let searches = 0;
    const engine = context.createSparringEngine({createWorker() {
        const worker = {terminate() {}, postMessage(message) {
            if (message === 'uci' || message === 'isready') queueMicrotask(() => worker.onmessage({data: message === 'uci' ? 'uciok' : 'readyok'}));
            if (message.startsWith('go ')) {
                searches++;
                queueMicrotask(() => {
                    worker.onmessage({data: 'info depth 18 score cp 30 pv e2e4 e7e5'});
                    worker.onmessage({data: 'bestmove e2e4'});
                });
            }
        }};
        return worker;
    }});
    const state = {initialFen: initial, moves: []};
    const result = await engine.analyze(state);
    result.score.value = 999; result.pv.push('a2a4');
    const cached = await engine.analyze(state);
    assert.equal(cached.score.value, 30); assert.equal(cached.pv.length, 2);
    assert.equal(searches, 1, 'Returning to the exact analysed position does not restart the engine search');
    await engine.analyze({...state, moves: ['g1f3', 'g8f6', 'f3g1', 'f6g8']});
    assert.equal(searches, 2, 'Transpositions with different repetition history do not share definitive results');
    await engine.analyze(state, {maxTimeMs: 900});
    assert.equal(searches, 3, 'A short analysis cannot satisfy a different search budget');
    engine.dispose();
    await assert.rejects(engine.analyze(state), /disposed/);
    console.log('History-aware bounded analysis caching and immutable results passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
