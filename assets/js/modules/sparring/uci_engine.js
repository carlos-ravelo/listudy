// Practice levels deliberately have no claimed Elo calibration.
const practiceLevels = [
    { skill: 0, depth: 1, movetime: 100 },
    { skill: 1, depth: 2, movetime: 150 },
    { skill: 3, depth: 4, movetime: 200 },
    { skill: 6, depth: 6, movetime: 350 },
    { skill: 10, depth: 8, movetime: 500 },
    { skill: 14, depth: 12, movetime: 700 },
    { skill: 18, depth: 16, movetime: 700 },
    { skill: 20, movetime: 700 }
];

export function sparringStrength(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 8 ? number : 2;
}

function createUciEngine({ createWorker = () => new Worker('/stockfish/js/stockfish.wasm.js'),
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
            if (pending?.kind === 'bestmove ' && line.startsWith('info ') && !/lowerbound|upperbound/.test(line) &&
                !/\bmultipv (?:[2-9]|\d{2,})\b/.test(line)) {
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
                worker.postMessage(`setoption name Skill Level value ${options.skill ?? 20}`);
                worker.postMessage(`position fen ${initialFen}${moves.length ? ' moves ' + moves.join(' ') : ''}`);
                worker.postMessage(`go${options.depth ? ' depth ' + options.depth : ''} movetime ${options.movetime || movetime}`);
            });
            const move = result.line.split(/\s+/)[1];
            if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) && !['(none)', '0000'].includes(move)) throw new Error('Invalid engine move');
            return { ...result, uci: move };
    }
    return {
        search,
        cancel() { fail(new Error('Engine cancelled')); },
        dispose() { disposed = true; fail(new Error('Engine disposed')); }
    };
}

// Separate workers and hash tables keep the weakened opponent out of grading.
export function createSparringEngine({ strength = 2, ...options } = {}) {
    let level = sparringStrength(strength);
    const analyst = createUciEngine(options);
    const opponent = createUciEngine(options);
    return {
        async bestMove(state) { return (await opponent.search(state, practiceLevels[level - 1])).uci; },
        analyze(state, searchOptions) { return analyst.search(state, { ...searchOptions, skill: 20 }); },
        canReuseAnalysisMove: () => level === 8,
        setStrength(value) {
            const next = sparringStrength(value);
            if (level !== next) { level = next; opponent.cancel(); }
            return level;
        },
        cancel() { analyst.cancel(); opponent.cancel(); },
        dispose() { analyst.dispose(); opponent.dispose(); }
    };
}
