const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
class Element {
    constructor() { this.children = []; this.classList = new Set(); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
    addEventListener() {}
}
function mount(initial = {}, pathname = '/en/achievements') {
    const saved = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
    const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)) };
    const document = Object.assign(new EventTarget(), {
        readyState: 'loading', body: new Element(),
        createElement: () => new Element(),
        querySelector: () => null
    });
    let container;
    document.getElementById = id => id === 'achievement_container' ? container : null;
    const window = Object.assign(new EventTarget(), { location: { pathname }, setTimeout() {} });
    const context = vm.createContext({ localStorage: storage, StorageAdapter: storage, window, document, Event, CustomEvent,
        Date: class extends Date { getHours() { return 12; } } });
    for (const file of ['modules/achievement_progress.js', 'components/achievements.js']) {
        vm.runInContext(read(file).replace(/^import .*\n/gm, '').replace(/^export /gm, ''), context);
    }
    window.dispatchEvent(new Event('load'));
    const study = read('pages/study/study.js');
    const start = study.indexOf('function achievement_end_of_line()');
    vm.runInContext(study.slice(start, study.indexOf('\n}', start) + 2), context);
    return { saved, storage, document, window, context,
        attach() { container = new Element(); document.dispatchEvent(new Event('phx:update')); return container; },
        increment(key) { return context.incrementAchievementCounter(key); }
    };
}
const study = mount();
for (const [count, key] of [[2, 'student'], [24, 'student2'], [99, 'student3'], [499, 'student4']]) {
    study.storage.setItem('achievements_lines_learned', count);
    study.context.achievement_end_of_line();
    assert(study.saved.has('achievement_' + key), `${key}: evaluate every tier from actual study completion`);
    assert.equal(Number(study.saved.get('achievements_lines_learned')), count + 1);
}
const popups = study.document.body.children.length;
study.context.achievement_end_of_line();
assert.equal(study.document.body.children.length, popups, 'Already unlocked tiers do not show duplicate popups');
const list = study.attach();
assert.equal(list.children.length, 15);
for (let i = 0; i < 3; i++) study.document.dispatchEvent(new Event('phx:update'));
assert.equal(list.children.length, 15, 'LiveView updates replace the list instead of appending duplicates');
assert.equal(study.saved.get('achievements_total_visits'), '1', 'LiveView updates do not count additional document visits');
const replacement = study.attach();
assert.equal(replacement.children.length, 15, 'Render a newly mounted achievement container');
const restored = mount({ achievements_lines_learned: 500, achievements_total_visits: 2, achievement_student: 'previously unlocked' });
for (const key of ['student', 'student2', 'student3', 'student4', 'newcomer']) assert(restored.saved.has('achievement_' + key));
assert.equal(restored.saved.get('achievement_student'), 'previously unlocked', 'Preserve existing unlock markers');
for (const [counter, tiers] of [
    ['achievements_tactics_solved', [[5, 'tacticsolver'], [32, 'tacticsolver2'], [256, 'tacticsolver3']]],
    ['achievements_endgames_solved', [[3, 'endgames'], [27, 'endgames2'], [81, 'endgames3']]],
    ['achievements_blind_tactics_solved', [[5, 'blindtactics']]]
]) {
    const page = mount();
    for (const [threshold, key] of tiers) {
        page.storage.setItem(counter, threshold - 1);
        assert(!page.saved.has('achievement_' + key));
        page.increment(counter);
        assert(page.saved.has('achievement_' + key));
    }
}
const special = mount({}, '/en/blog/a-post');
assert(special.saved.has('achievement_newsreader'));
for (const keyCode of [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]) {
    const event = new Event('keydown');
    Object.defineProperty(event, 'keyCode', { value: keyCode });
    special.document.dispatchEvent(event);
}
assert(special.saved.has('achievement_konami'));
console.log('Achievements: every threshold, actual study completion, initial evaluation, remounting and special rules passed');
