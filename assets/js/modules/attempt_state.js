export function createAttemptState(record) {
    let active = true;
    return {
        get active() { return active; },
        decision(correct) {
            if (!active) return false;
            record.attempts++;
            if (!correct) record.errors++;
            return true;
        },
        assist() {
            if (!active) return false;
            record.assisted = true;
            return true;
        },
        finish(result = {}) {
            if (!active) return false;
            active = false;
            Object.assign(record, result);
            return true;
        }
    };
}
