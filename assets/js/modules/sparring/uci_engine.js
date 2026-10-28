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

export function engineHashMb(memory) {
    if (typeof memory !== 'number' || !Number.isFinite(memory) || memory <= 0) return 16;
    return memory <= 1 ? 4 : memory <= 2 ? 8 : 16;
}

function deviceMemoryHint() {
    try { return typeof navigator === 'undefined' ? undefined : navigator.deviceMemory; }
    catch (_) { return undefined; }
}

export function createUciEngine({ createWorker = createStockfishWorker,
    timeoutMs = 20000, movetime = 700, deviceMemory = deviceMemoryHint() } = {}) {
    let worker;
    let pending;
    let ready;
    let disposed = false;
    let generation = 0;
    let eloRange = null;
    let hashRange = null;
    function fail(reason) {
        if (pending) { clearTimeout(pending.timer); clearTimeout(pending.budgetTimer); pending.reject(reason); pending.finish(); pending = null; }
        if (worker) worker.terminate();
        worker = null;
        ready = null;
        eloRange = null;
        hashRange = null;
    }
    function waitFor(kind, send) {
        return new Promise((resolve, reject) => {
            let finish;
            const done = new Promise(resolve => { finish = resolve; });
            pending = { kind, resolve, reject, done, finish, timer: setTimeout(() => fail(new Error('Engine timeout')), timeoutMs) };
            try { send(); } catch (error) { fail(error); }
        });
    }
    async function initialize() {
        const current = worker = createWorker();
        worker.onerror = () => { if (worker === current) fail(new Error('Engine unavailable')); };
        worker.onmessage = event => {
            if (worker !== current) return;
            const line = String(event.data).trim();
            if (line.startsWith('option name Hash type spin')) {
                const range = line.match(/default (\d+) min (\d+) max (\d+)/);
                if (range) {
                    const [initial, min, max] = range.slice(1).map(Number);
                    if (min > 0 && min <= initial && initial <= max && Number.isSafeInteger(max)) hashRange = {initial, min, max};
                }
            }
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
            clearTimeout(task.budgetTimer);
            task.finish();
            if (task.cancelled) task.reject(new Error('Engine cancelled'));
            else task.resolve({ line, ...task.analysis, timedOut: task.timedOut === true });
        };
        await waitFor('uciok', () => worker.postMessage('uci'));
        if (worker !== current) throw new Error('Engine cancelled');
        if (hashRange) {
            const size = Math.max(hashRange.min, Math.min(hashRange.initial, hashRange.max, engineHashMb(deviceMemory)));
            if (size !== hashRange.initial) worker.postMessage(`setoption name Hash value ${size}`);
        }
        // This private, single-thread build already starts with a fresh game.
        await waitFor('readyok', () => worker.postMessage('isready'));
    }
    async function search({ initialFen, moves }, options = {}) {
            if (disposed) throw new Error('Engine disposed');
            const request = generation;
            if (!ready) {
                const initialization = initialize();
                ready = initialization;
                initialization.catch(() => { if (ready === initialization) ready = null; });
            }
            await ready;
            if (disposed) throw new Error('Engine disposed');
            if (pending?.cancelled) await pending.done;
            if (disposed || request !== generation) throw new Error('Engine cancelled');
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
                if (options.targetDepth) {
                    clearTimeout(pending.timer);
                    pending.timer = null;
                    pending.budgetTimer = setTimeout(() => stop(false), options.maxTimeMs);
                    worker.postMessage(`go depth ${options.targetDepth}`);
                } else worker.postMessage(`go${options.depth ? ' depth ' + options.depth : ''} movetime ${options.movetime || movetime}`);
            });
            const move = result.line.split(/\s+/)[1];
            if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) && !['(none)', '0000'].includes(move)) throw new Error('Invalid engine move');
            return { ...result, uci: move, targetDepth: options.targetDepth || null,
                targetReached: Boolean(options.targetDepth && result.score && result.depth >= options.targetDepth && !result.timedOut) };
    }
    function stop(cancelled) {
        if (!pending || pending.kind !== 'bestmove ') return;
        pending.cancelled ||= cancelled;
        pending.timedOut ||= !cancelled;
        clearTimeout(pending.budgetTimer);
        if (pending.stopping) return;
        pending.stopping = true;
        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => fail(new Error('Engine stop timeout')), 1000);
        try { worker.postMessage('stop'); } catch (error) { fail(error); }
    }
    return {
        search,
        cancel() { generation++; stop(true); },
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
            const targetDepth = searchOptions.targetDepth ?? searchOptions.depth ?? 18;
            const maxTimeMs = searchOptions.maxTimeMs ?? 4000;
            if (!Number.isInteger(targetDepth) || targetDepth < 1 || targetDepth > 128 ||
                !Number.isFinite(maxTimeMs) || maxTimeMs <= 0) throw new Error('Invalid analysis policy');
            const key = JSON.stringify([stockfishVersion, 'lite-single', state.initialFen, state.moves, targetDepth, maxTimeMs]);
            if (analyses.has(key)) {
                const value = analyses.get(key);
                analyses.delete(key); analyses.set(key, value);
                return { ...value, score: {...value.score}, pv: [...(value.pv || [])] };
            }
            const result = await analyst.search(state, { targetDepth, maxTimeMs, elo: null });
            if (result.targetReached) {
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
