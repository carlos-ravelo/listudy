const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const values = new Map(), timers = new Map(), events = {}, input = {checked: false};
let finished = false, advances = 0, clock = 0;
const context = vm.createContext({
    localStorage: {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)},
    document: {hidden: false, getElementById: () => input, addEventListener: (name, callback) => events[name] = callback},
    window: {addEventListener: (name, callback) => events[name] = callback},
    setTimeout: callback => {timers.set(++clock, callback); return clock;}, clearTimeout: id => timers.delete(id)
});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../../js/modules/puzzle_autoplay.js'), 'utf8').replace('export ', ''), context);
const autoplay = context.createPuzzleAutoplay({isFinished: () => finished, next: () => advances++});
autoplay.refresh(); assert.equal(input.checked, false);
input.checked = true; input.onchange();
assert.equal(timers.size, 0, 'Enabling autoplay never skips an unsolved puzzle');
finished = true; autoplay.completed(); autoplay.refresh();
assert.equal(timers.size, 1, 'Render updates do not duplicate timers');
input.checked = false; input.onchange(); assert.equal(timers.size, 0);
input.checked = true; input.onchange();
const complete = () => {const callback = [...timers.values()][0]; timers.clear(); callback();};
complete(); assert.equal(advances, 1);
autoplay.refresh(); assert.equal(timers.size, 0, 'Wait for the next puzzle before scheduling again');
autoplay.reset();
autoplay.completed(); autoplay.cancel(); assert.equal(timers.size, 0, 'Manual navigation cancels autoplay');
autoplay.reset(); autoplay.completed(); context.document.hidden = true; events.visibilitychange(); assert.equal(timers.size, 0);
context.document.hidden = false; finished = false; events.visibilitychange(); assert.equal(timers.size, 0);
const restored = context.createPuzzleAutoplay({isFinished: () => false, next() {}});
restored.refresh(); assert.equal(input.checked, true, 'Preference persists across puzzles and reloads');
console.log('Puzzle autoplay: opt-in, solved-only, cancellation, hidden tabs and persistence passed');
