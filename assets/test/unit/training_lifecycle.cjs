const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const createPageScope = require('./page_scope_helper.cjs');
const source = fs.readFileSync(path.join(__dirname, '../../js/modules/training_lifecycle.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const createTrainingLifecycle = new Function('createPageScope', source + '\nreturn createTrainingLifecycle;')(createPageScope);
const transition = (events, name, persisted) => {
    const event = new Event(name); event.persisted = persisted; events.dispatchEvent(event);
};

(async () => {
    let id = 0, starts = 0, cleanups = 0, inputs = 0, intervalsRun = 0, pageCleanups = 0;
    const tasks = new Map(), intervals = new Map(), frames = new Map();
    const timers = {
        setTimeout(callback) { tasks.set(++id, callback); return id; }, clearTimeout: id => tasks.delete(id),
        setInterval(callback) { intervals.set(++id, callback); return id; }, clearInterval: id => intervals.delete(id),
        requestAnimationFrame(callback) { frames.set(++id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id)
    };
    const events = new EventTarget(), button = { onclick: null };
    const lifecycle = createTrainingLifecycle({ events, timers, restore: () => mount() });
    lifecycle.page.interval(() => intervalsRun++, 1000);
    const oldInterval = [...intervals.values()][0];
    lifecycle.page.use(() => pageCleanups++);
    function mount() {
        starts++;
        const scope = lifecycle.reset();
        scope.use(() => cleanups++);
        scope.assign(button, 'onclick', () => inputs++);
        scope.timeout(() => inputs++, 10);
        scope.frame(() => inputs++);
        return scope;
    }
    const first = mount(), firstInput = button.onclick, firstTimer = [...tasks.values()][0];
    const wait = first.sleep(100);
    mount();
    assert.equal(await wait, false);
    assert.equal(cleanups, 1);
    firstInput(); firstTimer();
    assert.equal(inputs, 0, 'Queued input and timers from an old exercise cannot affect its replacement');
    button.onclick(); assert.equal(inputs, 1);
    const secondInput = button.onclick;
    transition(events, 'pagehide', true);
    assert.equal(lifecycle.run.active, false);
    assert.equal(lifecycle.page.active, true);
    assert.equal(cleanups, 2);
    assert.equal(tasks.size, 0); assert.equal(frames.size, 0);
    secondInput(); assert.equal(inputs, 1);
    transition(events, 'pageshow', true);
    assert.equal(starts, 3);
    assert.equal(lifecycle.run.active, true);
    button.onclick(); assert.equal(inputs, 2);
    transition(events, 'pagehide', true);
    transition(events, 'pageshow', true);
    assert.equal(starts, 4, 'Each cached return creates exactly one fresh exercise');
    transition(events, 'pagehide', false);
    assert.equal(cleanups, 4);
    assert.equal(pageCleanups, 1);
    assert.equal(intervals.size, 0);
    assert.equal(button.onclick, null);
    oldInterval(); assert.equal(intervalsRun, 0);
    transition(events, 'pageshow', true);
    assert.equal(starts, 4, 'Destroyed pages must not remount');
    assert.equal(lifecycle.reset().active, false);
    lifecycle.destroy(); assert.equal(pageCleanups, 1);
    console.log('Training lifecycle: restart, queued input, timers, intervals, cached returns and permanent teardown passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
