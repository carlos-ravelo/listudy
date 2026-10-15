const DEFAULT_SESSION_GOAL = 20;
const SESSION_IDLE_MS = 120000;

function sessionGoal(value) {
    const goal = Number(value);
    return Number.isInteger(goal) && goal >= 5 && goal <= 200 ? goal : DEFAULT_SESSION_GOAL;
}

function sessionDay(now) {
    const date = new Date(now);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function createPracticeTracker({ save, id = () => crypto.randomUUID() }) {
    let current = null;
    let lastTick = 0;
    let lastActivity = 0;
    let visible = true;
    let counted = new Set();
    let savedRecord = '';
    function bucket(now) {
        const key = sessionDay(now);
        return current.days[key] || (current.days[key] = { activeMs: 0, decisions: 0 });
    }
    function tick(now = Date.now(), nextVisible = visible) {
        if (current?.status === 'active') {
            const previousMs = current.activeMs;
            const until = Math.min(now, lastActivity + SESSION_IDLE_MS);
            let from = lastTick;
            if (visible) while (from < until) {
                const midnight = new Date(from);
                midnight.setHours(24, 0, 0, 0);
                const end = Math.min(until, midnight.getTime());
                bucket(from).activeMs += end - from;
                current.activeMs += end - from;
                from = end;
            }
            if (current.activeMs !== previousMs) current.updatedAt = Math.max(current.updatedAt, now);
        }
        lastTick = now;
        visible = nextVisible;
    }
    function activity(now = Date.now(), nextVisible = visible) {
        tick(now, nextVisible);
        lastActivity = now;
    }
    function persist() {
        if (current && current.newCount + current.reviewCount > 0) {
            const serialized = JSON.stringify(current);
            if (serialized === savedRecord) return;
            save(JSON.parse(serialized));
            savedRecord = serialized;
        }
    }
    function end(reason = 'stopped', now = Date.now()) {
        if (current?.status === 'active') {
            tick(now);
            current.status = reason;
            current.endedAt = now;
            current.updatedAt = Math.max(current.updatedAt, now);
            persist();
        }
        return current;
    }
    function begin(mode, goal, now = Date.now()) {
        if (current?.status === 'active' && current.mode === mode) return current;
        end('stopped', now);
        current = { id: id(), mode, goal: mode === 'smart' ? sessionGoal(goal) : null,
            startedAt: now, updatedAt: now, activeMs: 0, newCount: 0, reviewCount: 0,
            correctCount: 0, status: 'active', days: {} };
        counted = new Set();
        savedRecord = '';
        lastTick = lastActivity = now;
        return current;
    }
    function decision(key, learning, correct, assisted, now = Date.now()) {
        if (!current || current.status !== 'active') return false;
        activity(now);
        if (counted.has(key)) return false;
        counted.add(key);
        if (learning) current.newCount++;
        else {
            current.reviewCount++;
            if (correct && !assisted) current.correctCount++;
        }
        bucket(now).decisions++;
        current.updatedAt = Math.max(current.updatedAt, now);
        persist();
        return true;
    }
    return { begin, decision, end, tick, activity, persist,
        get current() { return current; },
        get goalReached() { return current?.mode === 'smart' && current.newCount + current.reviewCount >= current.goal; },
        clear() { current = null; counted.clear(); }
    };
}

function practiceTotals(sessions = {}, now = Date.now()) {
    const today = sessionDay(now);
    const records = Object.values(sessions).filter(record => record && record.newCount + record.reviewCount > 0);
    return {
        sessions: records.length,
        activeMs: records.reduce((sum, record) => sum + (record.activeMs || 0), 0),
        decisions: records.reduce((sum, record) => sum + record.newCount + record.reviewCount, 0),
        todayMs: records.reduce((sum, record) => sum + (record.days?.[today]?.activeMs || 0), 0),
        todayDecisions: records.reduce((sum, record) => sum + (record.days?.[today]?.decisions || 0), 0),
        recent: records.sort((a, b) => b.startedAt - a.startedAt).slice(0, 5)
    };
}

export { DEFAULT_SESSION_GOAL, SESSION_IDLE_MS, sessionGoal, sessionDay, createPracticeTracker, practiceTotals };
