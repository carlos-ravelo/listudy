// A private worker per session avoids shared window.sf listeners and stale searches.
export function createSparringEngine({ createWorker = () => new Worker('/stockfish/js/stockfish.wasm.js'),
    timeoutMs = 20000, movetime = 700 } = {}) {
    let worker;
    let pending;
    let ready;
    let disposed = false;
    function fail(reason) {
        if (pending) { clearTimeout(pending.timer); pending.reject(reason); pending = null; }
        if (worker) worker.terminate();
        worker = null;
        ready = null;
    }
    function waitFor(kind, send) {
        return new Promise((resolve, reject) => {
            pending = { kind, resolve, reject, timer: setTimeout(() => fail(new Error('Engine timeout')), timeoutMs) };
            try { send(); } catch (error) { fail(error); }
        });
    }
    async function initialize() {
        const current = worker = createWorker();
        worker.onerror = () => { if (worker === current) fail(new Error('Engine unavailable')); };
        worker.onmessage = event => {
            if (worker !== current) return;
            const line = String(event.data).trim();
            if (pending?.kind === 'bestmove ' && line.startsWith('info ') && !/lowerbound|upperbound/.test(line)) {
                const score = line.match(/\bscore (cp|mate) (-?\d+)/);
                if (score) pending.analysis = { score: { type: score[1], value: Number(score[2]) },
                    depth: Number(line.match(/\bdepth (\d+)/)?.[1] || 0), pv: line.match(/\bpv (.+)/)?.[1].split(/\s+/) || [] };
            }
            if (!pending || !line.startsWith(pending.kind)) return;
            const task = pending;
            pending = null;
            clearTimeout(task.timer);
            task.resolve({ line, ...task.analysis });
        };
        await waitFor('uciok', () => worker.postMessage('uci'));
        if (worker !== current) throw new Error('Engine cancelled');
        // This private, single-thread build already starts with a fresh game.
        await waitFor('readyok', () => worker.postMessage('isready'));
    }
    async function search({ initialFen, moves }, options = {}) {
            if (disposed) throw new Error('Engine disposed');
            if (!ready) {
                const initialization = initialize();
                ready = initialization;
                initialization.catch(() => { if (ready === initialization) ready = null; });
            }
            await ready;
            if (disposed) throw new Error('Engine disposed');
            if (pending) throw new Error('Engine busy');
            const result = await waitFor('bestmove ', () => {
                worker.postMessage(`position fen ${initialFen}${moves.length ? ' moves ' + moves.join(' ') : ''}`);
                worker.postMessage(`go movetime ${options.movetime || movetime}`);
            });
            const move = result.line.split(/\s+/)[1];
            if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) && !['(none)', '0000'].includes(move)) throw new Error('Invalid engine move');
            return { ...result, uci: move };
    }
    return {
        async bestMove(state) { return (await search(state)).uci; },
        analyze(state, options) { return search(state, options); },
        cancel() { fail(new Error('Engine cancelled')); },
        dispose() { disposed = true; fail(new Error('Engine disposed')); }
    };
}
