const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const workers = [];
let failNext = false;
class FakeWorker {
    constructor(url) { this.url = url; this.listeners = new Map(); this.stopped = false; this.fail = failNext; failNext = false; workers.push(this); }
    addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    send(type, data) { for (const listener of this.listeners.get(type) || []) listener({ data }); }
    terminate() { this.stopped = true; }
    postMessage(message) { queueMicrotask(() => this.fail ? this.send('error') : this.send('message', message === 'isready' ? 'readyok' : 'uciok')); }
}
const moduleRequire = require('node:module').createRequire(path.resolve(__dirname, '../../js/modules/engine/stockfish.js'));
const context = vm.createContext({require: moduleRequire, Worker:FakeWorker, window:{}, WebAssembly, BigInt, setTimeout, clearTimeout});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js/modules/engine/stockfish.js'),'utf8').replace(/^export /gm,''), context);
(async()=>{
    assert(context.createStockfishWorker().url.endsWith('stockfish-19-lite-single.js'));
    assert(context.createStockfishWorker({forceFallback:true}).url.endsWith('stockfish-19-asm.js'));
    context.WebAssembly=undefined;
    assert(context.createStockfishWorker().url.endsWith('stockfish-19-asm.js'));
    context.WebAssembly=WebAssembly;
    failNext=true;
    await assert.rejects(context.load_stockfish(()=>{}),/unavailable/);
    assert(workers.at(-1).stopped);
    const first=[],second=[];
    let loaded=false;
    const worker=await context.load_stockfish(line=>first.push(line),()=>loaded=true);
    assert(loaded);
    assert.equal(context.window.sf,worker);
    await context.load_stockfish(line=>second.push(line));
    worker.send('message','bestmove e2e4');
    assert.deepEqual(first,[]);
    assert.deepEqual(second,['bestmove e2e4']);
    assert.equal(worker.listeners.get('message').size,1);
    console.log('Shared Stockfish factory: WASM/ASM selection, readiness, failed-load retry and listener replacement passed');
})().catch(error=>{console.error(error);process.exitCode=1});
