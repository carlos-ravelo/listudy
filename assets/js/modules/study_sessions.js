import { createPracticeTracker, practiceTotals, sessionGoal } from './study/practice_sessions.js';

export function setupStudySessions({ getStats, persist, storage, labels, onContinue, onFinish }) {
    const goal = document.getElementById('study_session_goal');
    const counter = document.getElementById('study_session_counter');
    const endPanel = document.getElementById('study_session_end');
    const summary = document.getElementById('study_session_result');
    const history = document.getElementById('study_session_history');
    let lastSave = Date.now();
    const tracker = createPracticeTracker({
        id: () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        save(record) {
            const stats = getStats();
            stats.studySessions = { ...stats.studySessions, [record.id]: record };
            persist();
        }
    });
    const eligible = () => !document.hidden && document.hasFocus() && !document.querySelector('dialog[open]') && !document.querySelector('.study-sparring-paused') &&
        document.getElementById('progress_modal')?.style.display !== 'block';
    const duration = ms => {
        const seconds = Math.floor(ms / 1000);
        return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
            : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    };
    const description = record => `${record.newCount} ${labels.newMoves} · ${record.reviewCount} ${labels.practiced} · ${duration(record.activeMs)}`;
    function renderHistory() {
        const totals = practiceTotals(getStats().studySessions);
        const total = document.getElementById('study_time_total');
        const today = document.getElementById('study_time_today');
        if (total) total.textContent = `${labels.total}: ${duration(totals.activeMs)} · ${totals.decisions} ${labels.decisions} · ${totals.sessions} ${labels.sessions}`;
        if (today) today.textContent = `${labels.today}: ${duration(totals.todayMs)} · ${totals.todayDecisions} ${labels.decisions}`;
        if (!history) return;
        history.replaceChildren();
        for (const record of totals.recent) {
            const item = document.createElement('li');
            const mode = record.mode === 'sparring' ? 'Sparring' : record.mode === 'smart' ? 'Smart' : record.mode === 'positions' ? labels.positions : labels.lines;
            const state = record.id === tracker.current?.id && record.status === 'active' ? labels.inProgress
                : record.status === 'goal' ? labels.goalReached : record.status === 'no-work' ? labels.noWork : labels.saved;
            item.textContent = `${new Date(record.startedAt).toLocaleString()} · ${mode} · ${description(record)} · ${state}`;
            history.appendChild(item);
        }
    }
    function render() {
        const record = tracker.current;
        if (counter) {
            counter.hidden = record?.mode !== 'smart' || record.status !== 'active';
            if (!counter.hidden) counter.textContent = `${labels.session}: ${record.newCount + record.reviewCount}/${record.goal} ${labels.decisions} · ${description(record)}` +
                (tracker.goalReached ? ` · ${labels.finishChain}` : '');
        }
    }
    goal.value = sessionGoal(storage.getItem('smart_session_goal'));
    goal.onchange = () => {
        if (!goal.checkValidity()) { goal.reportValidity(); return; }
        goal.value = sessionGoal(goal.value);
        storage.setItem('smart_session_goal', goal.value);
    };
    document.getElementById('study_session_continue').onclick = () => { endPanel.hidden = true; onContinue(); };
    document.getElementById('study_session_finish').onclick = () => { endPanel.hidden = true; onFinish(); };
    function activity() { tracker.activity(Date.now(), eligible()); }
    document.addEventListener('pointerdown', activity, true);
    document.addEventListener('keydown', activity, true);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { tracker.tick(Date.now(), false); tracker.persist(); storage.forceSyncAll?.(); }
        else activity();
    });
    window.addEventListener('blur', () => { tracker.tick(Date.now(), false); tracker.persist(); });
    window.addEventListener('focus', activity);
    window.addEventListener('pagehide', () => { tracker.end('left'); storage.forceSyncAll?.(); renderHistory(); });
    document.getElementById('progress').addEventListener('click', () => { tracker.tick(Date.now(), eligible()); tracker.persist(); renderHistory(); });
    setInterval(() => {
        tracker.tick(Date.now(), eligible());
        render();
        if (Date.now() - lastSave >= 15000) { tracker.persist(); lastSave = Date.now(); }
    }, 1000);
    renderHistory();
    return {
        begin(mode) {
            tracker.tick(Date.now(), eligible());
            tracker.begin(mode, storage.getItem('smart_session_goal'));
            endPanel.hidden = true;
            render();
        },
        decision(mode, key, learning, correct, assisted) {
            if (tracker.current?.mode !== mode || tracker.current.status !== 'active') {
                tracker.begin(mode, storage.getItem('smart_session_goal'));
            }
            tracker.decision(key, learning, correct, assisted);
            render();
        },
        boundary(reason) {
            const record = tracker.current;
            if (record?.mode !== 'smart') return false;
            if (record.status === 'active' && !reason && !tracker.goalReached) return false;
            tracker.end(reason || 'goal');
            summary.textContent = description(record);
            endPanel.hidden = false;
            counter.hidden = true;
            document.getElementById('study_session_end_title').textContent = record.status === 'goal' ? labels.goalReached : labels.noWork;
            document.getElementById('study_session_end_title').focus();
            renderHistory();
            return true;
        },
        end() { tracker.end(); endPanel.hidden = true; render(); renderHistory(); },
        refresh: renderHistory,
        clear() { tracker.clear(); endPanel.hidden = true; render(); renderHistory(); }
    };
}
