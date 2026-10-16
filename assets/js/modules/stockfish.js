const engineDistribution = require('../../stockfish.config.js');
export const stockfishVersion = engineDistribution.version;

export function createStockfishWorker({ forceFallback = false } = {}) {
    // The WASM build needs SIMD; use the same release's JS build otherwise.
    const simd = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123,
        3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11);
    const wasm = !forceFallback && typeof WebAssembly === 'object' &&
        typeof BigInt === 'function' && WebAssembly.validate(simd);
    const file = wasm ? engineDistribution.engine : engineDistribution.fallback;
    return new Worker(`/stockfish/${engineDistribution.version}/${file}.js`);
}

let loading;
let listenerWorker;
let messageListener;

export function load_stockfish(listener, after_load = () => {}) {
    if (!loading) {
        const worker = createStockfishWorker();
        loading = new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                worker.removeEventListener('message', ready);
                worker.removeEventListener('error', failed);
            };
            const failed = () => {
                cleanup(); worker.terminate(); loading = null;
                reject(new Error('Stockfish unavailable'));
            };
            const ready = event => {
                if (event.data !== 'readyok') return;
                cleanup(); window.sf = worker; resolve(worker);
            };
            const timer = setTimeout(failed, 20000);
            worker.addEventListener('message', ready);
            worker.addEventListener('error', failed);
            worker.postMessage('uci');
            worker.postMessage('isready');
        });
    }
    return loading.then(worker => {
        if (messageListener) listenerWorker.removeEventListener('message', messageListener);
        messageListener = event => listener(event.data);
        listenerWorker = worker;
        worker.addEventListener('message', messageListener);
        after_load();
        return worker;
    });
}
