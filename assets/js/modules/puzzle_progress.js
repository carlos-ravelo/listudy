import { createAttemptState } from './attempt_state.js';

// Native catalogue progress is device-local and independent of immutable source data.
export function createPuzzleProgress(identity, {storage, now = Date.now} = {}) {
    if (!identity) return null;
    const key = `puzzle_progress_v1:${identity}`;
    const read = () => {
        try { return JSON.parse(storage.getItem(key)) || {}; } catch (_) { return {}; }
    };
    const record = { attempts: 0, errors: 0, assisted: false };
    const attempt = createAttemptState(record);
    const started = now();
    return {
        mistake() { attempt.decision(false); attempt.assist(); },
        assist() { attempt.assist(); },
        finish() {
            if (!attempt.finish()) return;
            const { errors, assisted } = record;
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
