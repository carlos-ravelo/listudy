// Native catalogue progress is device-local and independent of immutable source data.
export function createPuzzleProgress(identity, {storage, now = Date.now} = {}) {
    if (!identity) return null;
    const key = `puzzle_progress_v1:${identity}`;
    const read = () => {
        try { return JSON.parse(storage.getItem(key)) || {}; } catch (_) { return {}; }
    };
    let errors = 0, assisted = false, ended = false;
    const started = now();
    return {
        mistake() { errors++; assisted = true; },
        assist() { assisted = true; },
        finish() {
            if (ended) return;
            ended = true;
            const previous = read();
            const value = {
                version: 1, solves: (Number(previous.solves) || 0) + 1,
                cleanSolves: (Number(previous.cleanSolves) || 0) + Number(!assisted && errors === 0),
                last: {at: now(), durationMs: Math.max(0, now() - started), errors, assisted}
            };
            try { storage.setItem(key, JSON.stringify(value)); } catch (_) {}
            return value;
        }
    };
}
