import { createStockfishWorker, stockfishVersion } from '../stockfish.js';

// Native engine Elo targets. These are not human or website ratings.
const practiceLevels = [1320, 1500, 1700, 1900, 2100, 2400, 2700, null];

export function sparringRating(level) {
    return practiceLevels[sparringStrength(level) - 1];
}

export function sparringStrength(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 8 ? number : 2;
}

function createUciEngine({ createWorker = createStockfishWorker,
    timeoutMs = 20000, movetime = 700 } = {}) {
    let worker;
    let pending;
    let ready;
    let disposed = false;
    let eloRange = null;
    function fail(reason) {
        if (pending) { clearTimeout(pending.timer); pending.reject(reason); pending = null; }
        if (worker) worker.terminate();
        worker = null;
        ready = null;
        eloRange = null;
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
            if (line.startsWith('option name UCI_Elo type spin')) {
                const range = line.match(/min (\d+) max (\d+)/);
                if (range) eloRange = { min: Number(range[1]), max: Number(range[2]) };
            }
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
                if (options.elo != null) {
                    if (!eloRange || options.elo < eloRange.min || options.elo > eloRange.max) throw new Error('Unsupported engine Elo');
                    worker.postMessage('setoption name UCI_LimitStrength value true');
                    worker.postMessage(`setoption name UCI_Elo value ${options.elo}`);
                } else {
                    worker.postMessage('setoption name UCI_LimitStrength value false');
                    worker.postMessage('setoption name Skill Level value 20');
                }
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
    let disposed = false;
    const analyses = new Map();
    const analyst = createUciEngine(options);
    const opponent = createUciEngine(options);
    return {
        metadata: () => ({ distribution: 'stockfish', version: stockfishVersion, build: 'lite-single', eloTarget: sparringRating(level) }),
        async bestMove(state, searchOptions = {}) { return (await opponent.search(state, { ...searchOptions, elo: sparringRating(level) })).uci; },
        async analyze(state, searchOptions = {}) {
            if (disposed) throw new Error('Engine disposed');
            const key = JSON.stringify([stockfishVersion, state.initialFen, state.moves, searchOptions.depth || null, searchOptions.movetime || options.movetime || 700]);
            if (analyses.has(key)) {
                const value = analyses.get(key);
                analyses.delete(key); analyses.set(key, value);
                return { ...value, score: {...value.score}, pv: [...(value.pv || [])] };
            }
            const result = await analyst.search(state, { ...searchOptions, elo: null });
            if (result.score && result.depth > 0) {
                analyses.set(key, {...result, score: {...result.score}, pv: [...(result.pv || [])]});
                if (analyses.size > 128) analyses.delete(analyses.keys().next().value);
            }
            return result;
        },
        canReuseAnalysisMove: () => level === 8,
        setStrength(value) {
            const next = sparringStrength(value);
            if (level !== next) { level = next; opponent.cancel(); }
            return level;
        },
        cancel() { analyst.cancel(); opponent.cancel(); },
        dispose() { disposed = true; analyses.clear(); analyst.dispose(); opponent.dispose(); }
    };
}
