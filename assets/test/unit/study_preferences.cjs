const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const values = new Map(), writes = [];
const storage = { getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, value); writes.push({ key, value }); } };
const labels = Object.fromEntries(['arrows_new2x', 'arrows_new5x', 'arrows_always', 'arrows_hidden',
    'arrow_type_playable', 'arrow_type_pgn', 'arrow_type_both', 'key_move_enabled', 'key_move_disabled',
    'review_fast', 'review_slow', 'instant', 'fast', 'medium', 'slow',
    'comments_always_on', 'comments_hidden', 'comments_when_arrows'].map(key => [key, `Localized ${key}`]));
let factory;
const context = vm.createContext({ CustomEvent,
    Alpine: { data(name, value) { assert.equal(name, 'studyPreferences'); factory = value; } } });
for (const file of ['modules/study/preferences.js', 'components/study_preferences.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8')
        .replace(/^export /gm, ''), context);
}
context.registerStudyPreferences(context.Alpine);
const model = context.createStudyPreferences({ storage, labels });
assert.equal(model.get('arrows'), labels.arrows_new2x);
assert.equal(model.get('comments'), labels.comments_when_arrows);
assert.equal(writes.length, 0, 'Initialization must not persist defaults before hydration');
values.set('show_arrows', labels.arrows_always);
values.set('board_review', labels.review_slow);
values.set('show_comments', labels.comments_hidden);
model.reload();
assert.equal(model.get('arrows'), labels.arrows_always);
assert.equal(model.get('review'), labels.review_slow);
assert.equal(model.get('comments'), labels.comments_hidden);
assert.equal(writes.length, 0, 'Reloading hydrated settings must not write them back');
model.cycle('arrows');
assert.equal(model.get('arrows'), labels.arrows_hidden);
assert.deepEqual(writes.at(-1), { key: 'show_arrows', value: labels.arrows_hidden });
model.cycle('arrows');
assert.equal(model.get('arrows'), labels.arrows_new2x);
for (const [name, sequence] of [
    ['arrowType', ['arrow_type_playable', 'arrow_type_pgn', 'arrow_type_both']],
    ['moveDelay', ['fast', 'medium', 'slow', 'instant']],
    ['review', ['review_fast', 'review_slow']],
    ['keyMoves', ['key_move_disabled', 'key_move_enabled']],
    ['comments', ['comments_when_arrows', 'comments_always_on', 'comments_hidden']]
]) for (const key of sequence) {
    assert.equal(model.cycle(name), true);
    assert.equal(model.get(name), labels[key], `${name} retains its existing cycle`);
}
const beforeUnknown = writes.length;
for (const name of ['unknown', '__proto__', 'constructor', undefined]) assert.equal(model.cycle(name), false);
assert.equal(writes.length, beforeUnknown);
const snapshot = model.snapshot(); snapshot.values.arrows = 'Changed UI text';
assert.equal(model.get('arrows'), labels.arrows_new2x, 'View snapshots cannot mutate preference state');
values.set('show_arrows', 'An unsupported translation'); model.reload();
assert.equal(model.get('arrows'), labels.arrows_new2x);
const tactics = context.createStudyPreferences({ storage, labels, tactics: true });
assert.equal(tactics.get('arrows'), labels.arrows_hidden);
assert.equal(tactics.get('comments'), labels.comments_hidden);
tactics.cycle('arrows'); tactics.cycle('comments');
assert.equal(values.get('tactics_show_arrows'), labels.arrows_new2x);
assert.equal(values.get('tactics_show_comments'), labels.comments_when_arrows);
assert.equal(values.get('show_arrows'), 'An unsupported translation');
assert.equal(values.get('show_comments'), labels.comments_hidden);

const element = new EventTarget(), effects = [], snapshots = [];
const component = factory();
component.$dispatch = (name, detail) => element.dispatchEvent(new CustomEvent(name, { detail }));
element.addEventListener('study-preferences-updated', event => {
    snapshots.push(event.detail); component.update(event.detail);
});
component.cycle('comments');
assert.equal(component.ready, false);
const dispose = context.bindStudyPreferences(element, model, name => effects.push(name));
assert.equal(component.ready, true);
assert.equal(effects.length, 0);
assert.equal(component.values.comments, labels.comments_hidden);
component.values.comments = 'A label edited in the view';
component.cycle('comments');
assert.equal(model.get('comments'), labels.comments_when_arrows);
assert.equal(component.values.comments, labels.comments_when_arrows);
assert.deepEqual(effects, ['comments']);
component.cycle('keyMoves');
assert.equal(component.keyMovesEnabled, false);
const beforeDispose = writes.length;
dispose(); dispose(); component.cycle('arrows');
assert.equal(writes.length, beforeDispose, 'Disposed controls cannot change preferences');
assert.equal(snapshots.length, 3);
console.log('Study preferences: stored labels, hydration, cycles, tactics isolation, view snapshots and cleanup passed.');
