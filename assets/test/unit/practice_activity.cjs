const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function target() {
    const listeners = [];
    return {
        listeners,
        addEventListener(type, handler, capture) { listeners.push({ type, handler, capture }); },
        removeEventListener(type, handler, capture) {
            const index = listeners.findIndex(item => item.type === type && item.handler === handler && item.capture === capture);
            if (index !== -1) listeners.splice(index, 1);
        },
        dispatch(type) { listeners.filter(item => item.type === type).forEach(item => item.handler()); }
    };
}
const document = Object.assign(target(), { hidden: false });
const window = target(), timers = new Map(), saved = [];
let now = new Date('2026-10-21T12:00:00Z').getTime(), sequence = 0, blocked = false, focused = true;
class Clock extends Date { static now() { return now; } }
const context = vm.createContext({
    document, window, Date: Clock,
    setInterval(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearInterval(id) { timers.delete(id); }
});
for (const file of ['study/practice_sessions.js', 'practice_activity.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules', file), 'utf8')
        .replace(/^export /gm, '').replace(/^\{ DEFAULT_SESSION_GOAL.*\};$/gm, ''), context);
}
const tracker = context.createPracticeTracker({ id: () => String(++sequence), save: record => saved.push(record) });
const eligible = () => !document.hidden && focused && !blocked;
const advance = milliseconds => { now += milliseconds; timers.forEach(timer => timer.callback()); };
tracker.begin('positions');
tracker.decision('first', false, true, false);
let stop = context.setupPracticeActivity({ tracker, eligible,
    onPageHide: () => tracker.end('left') });
assert.equal([...timers.values()][0].delay, 15000);
assert.equal(document.listeners.find(item => item.type === 'pointerdown').capture, true);
assert.equal(document.listeners.find(item => item.type === 'keydown').capture, true);
advance(1000);
assert.equal(tracker.current.activeMs, 1000);
blocked = true; document.dispatch('ui-blocking-changed');
advance(5000);
assert.equal(tracker.current.activeMs, 1000, 'Dialogs exclude time');
blocked = false; document.dispatch('ui-blocking-changed');
advance(1000);
assert.equal(tracker.current.activeMs, 2000);
focused = false; window.dispatch('blur');
advance(4000);
focused = true; window.dispatch('focus');
advance(1000);
assert.equal(tracker.current.activeMs, 3000, 'Unfocused time is excluded');
document.hidden = true; document.dispatch('visibilitychange');
advance(4000);
document.hidden = false; document.dispatch('visibilitychange');
advance(1000);
assert.equal(tracker.current.activeMs, 4000, 'Hidden time is excluded');
document.dispatch('pointerdown');
advance(180000);
assert.equal(tracker.current.activeMs, 124000, 'Activity stops accruing at the idle threshold');
document.dispatch('keydown');
advance(1000);
assert.equal(tracker.current.activeMs, 125000, 'Input resumes counting without adding idle time');
window.dispatch('pagehide');
assert.equal(tracker.current.status, 'left');
assert.equal(saved.at(-1).status, 'left');
stop(); stop();
assert.equal(document.listeners.length, 0);
assert.equal(window.listeners.length, 0);
assert.equal(timers.size, 0);

// Preserve the study policy: visible activity resets idleness, blocking does not
// persist immediately, rendering ticks each second, and hiding triggers sync.
let activities = 0, ticks = 0, persists = 0, hiddenSyncs = 0, renders = 0;
const studyTracker = {
    activity() { activities++; }, tick() { ticks++; }, persist() { persists++; }
};
const mount = () => context.setupPracticeActivity({ tracker: studyTracker, eligible,
    intervalMs: 1000, persistOnBlocking: false, resumeOnVisible: true,
    onHidden: () => hiddenSyncs++, onInterval: () => renders++ });
stop = mount();
assert.equal([...timers.values()][0].delay, 1000);
document.dispatch('ui-blocking-changed');
assert.equal(persists, 0);
document.hidden = true; document.dispatch('visibilitychange');
assert.equal(persists, 1);
assert.equal(hiddenSyncs, 1);
document.hidden = false; document.dispatch('visibilitychange');
assert.equal(activities, 1);
assert.equal(persists, 1);
advance(1000);
assert.equal(renders, 1);
stop();
const stoppedTicks = ticks;
document.dispatch('pointerdown'); window.dispatch('blur'); advance(15000);
assert.equal(ticks, stoppedTicks, 'Disposed observers cannot update the tracker');
assert.equal(activities, 1);
stop = mount();
document.dispatch('keydown'); advance(1000);
assert.equal(activities, 2, 'Remounting installs one activity handler');
assert.equal(ticks, stoppedTicks + 1, 'Remounting installs one interval');
assert.equal(renders, 2);
assert.equal(timers.size, 1);
stop();
assert.equal(document.listeners.length + window.listeners.length + timers.size, 0);
// The study controller also releases its progress handler and assigned controls.
const nodes = new Map();
document.getElementById = id => {
    if (!nodes.has(id)) nodes.set(id, Object.assign(target(), {
        hidden: true, value: '', textContent: '', replaceChildren() {}, appendChild() {}
    }));
    return nodes.get(id);
};
document.hasFocus = () => true;
document.querySelector = () => null;
document.createElement = () => ({ textContent: '' });
context.setupBlockingUi = () => {};
context.hasBlockingUi = () => false;
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study_sessions.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
const stats = {};
let studySaves = 0;
const mountStudy = () => context.setupStudySessions({
    getStats: () => stats, persist: () => studySaves++, labels: {},
    storage: { getItem: () => 20 }, onContinue() {}, onFinish() {}
});
const first = mountStudy();
first.begin('smart'); first.decision('smart', 'a', false, true, false);
const savesAfterDecision = studySaves;
advance(1000);
assert.equal(studySaves, savesAfterDecision, 'Study renders without saving every second');
advance(14000);
assert.equal(studySaves, savesAfterDecision + 1, 'Study retains its 15-second save cadence');
const second = mountStudy();
first.destroy();
assert.equal(timers.size, 1);
assert.equal(nodes.get('progress').listeners.length, 1);
assert.equal(typeof nodes.get('study_session_goal').onchange, 'function', 'Disposing an old controller retains newer control handlers');
second.destroy(); second.destroy();
assert.equal(document.listeners.length + window.listeners.length + timers.size, 0);
assert.equal(nodes.get('progress').listeners.length, 0);
assert.equal(nodes.get('study_session_goal').onchange, null);
assert.equal(nodes.get('study_session_continue').onclick, null);
assert.equal(nodes.get('study_session_finish').onclick, null);
console.log('Practice activity: blocking, visibility, focus, idleness, persistence policies and cleanup/remount passed.');
