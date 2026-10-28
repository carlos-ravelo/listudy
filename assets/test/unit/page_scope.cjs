const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const createPageScope = require('./page_scope_helper.cjs');
const source = fs.readFileSync(path.join(__dirname, '../../js/modules/study/page_lifecycle.js'), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/^export /gm, '');
const mountStudyPage = new Function('createPageScope', source + '\nreturn mountStudyPage;')(createPageScope);
(async () => {
    let id = 0, calls = 0;
    const pending = new Map(), intervals = new Map(), frames = new Map(), order = [], errors = [];
    const timers = { setTimeout(fn) { pending.set(++id, fn); return id; }, clearTimeout: key => pending.delete(key),
        setInterval(fn) { intervals.set(++id, fn); return id; }, clearInterval: key => intervals.delete(key),
        requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame: key => frames.delete(key) };
    const scope = createPageScope({ timers, onError: error => errors.push(error.message) });
    const target = new EventTarget(), original = () => {}, other = () => {};
    target.onclick = original;
    scope.listen(target, 'change', () => calls++);
    scope.assign(target, 'onclick', () => calls++);
    target.dispatchEvent(new Event('change')); target.onclick();
    assert.equal(calls, 2);
    const oldHandler = target.onclick;
    scope.interval(() => calls++, 1000);
    const oldInterval = [...intervals.values()][0];
    scope.timeout(() => calls++, 1); scope.frame(() => calls++);
    const oldTimer = [...pending.values()][0], oldFrame = [...frames.values()][0];
    const sleeping = scope.sleep(3000);
    scope.use(() => order.push('first'));
    scope.use(() => { throw new Error('cleanup'); });
    scope.use({ destroy() { order.push('last'); } });
    scope.destroy(); scope.destroy();
    assert.equal(await sleeping, false, 'Disposal releases pending waits without allowing their continuation');
    assert.equal(await scope.sleep(1), false);
    assert.deepEqual(order, ['last', 'first']);
    assert.deepEqual(errors, ['cleanup']);
    assert.equal(pending.size, 0); assert.equal(frames.size, 0); assert.equal(intervals.size, 0);
    assert.equal(target.onclick, original);
    target.dispatchEvent(new Event('change')); oldHandler(); oldTimer(); oldFrame(); oldInterval();
    assert.equal(calls, 2, 'Removed or already-queued callbacks cannot act after disposal');
    scope.use(() => order.push('late'));
    assert.equal(order.at(-1), 'late', 'Late resources are released immediately');
    const replacement = createPageScope();
    replacement.assign(target, 'onclick', () => {}); target.onclick = other;
    replacement.destroy(); assert.equal(target.onclick, other, 'Cleanup preserves handlers installed by another owner');
    const events = new EventTarget(), root = new EventTarget(); root.dataset = {};
    let starts = 0, cleanups = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    const first = mountStudyPage(root, async page => {
        starts++; page.use(() => cleanups++); await gate;
        if (page.active) calls++;
    }, { events });
    assert.equal(mountStudyPage(root, () => { starts++; }, { events }), first);
    await Promise.resolve(); assert.equal(starts, 1);
    const cached = new Event('pagehide'); cached.persisted = true;
    events.dispatchEvent(cached); assert.equal(first.scope.active, true);
    root.dispatchEvent(new Event('study-page-dispose'));
    assert.equal(root.dataset.studyPageState, 'disposed');
    const second = mountStudyPage(root, page => { starts++; page.use(() => cleanups++); }, { events });
    assert.equal(await second.ready, true); assert.equal(starts, 2);
    release(); assert.equal(await first.ready, false);
    first.destroy(); assert.equal(root.dataset.studyPageState, 'ready', 'An old owner cannot alter its replacement');
    events.dispatchEvent(new Event('pagehide'));
    assert.equal(cleanups, 2); assert.equal(second.scope.active, false);
    const failed = mountStudyPage(root, page => { page.use(() => cleanups++); throw new Error('init'); },
        { events, onError: error => errors.push(error.message) });
    assert.equal(await failed.ready, false); assert.equal(cleanups, 3);
    assert.equal(errors.at(-1), 'init');
    console.log('Page ownership: listeners, handlers, timers, frames, cleanup errors, hydration cancellation, duplicate mounts and back/forward cache passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
