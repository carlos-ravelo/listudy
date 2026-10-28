const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
for (const file of ['attempt_state', 'puzzle_progress']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules', file + '.js'), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
}
const values = new Map();
const storage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
let time = 10;
const options = {storage, now: () => time};
const clean = context.createPuzzleProgress('lichess:abc', options);
time = 50;
assert.equal(clean.finish().cleanSolves, 1);
clean.finish();
const retry = context.createPuzzleProgress('lichess:abc', options);
retry.mistake();
const result = retry.finish();
assert.equal(result.solves, 2);
assert.equal(result.cleanSolves, 1);
assert.equal(result.last.errors, 1);
assert.equal(result.last.assisted, true);
const other = context.createPuzzleProgress('listudy:abc', options);
assert.equal(other.finish().solves, 1);
assert.equal(values.size, 2);
assert.equal(context.createPuzzleProgress(null, options), null);
context.createPuzzleProgress('lichess:blocked', {}).finish();
assert.deepEqual(Object.keys(result).sort(), ['cleanSolves', 'last', 'solves', 'version']);
assert.deepEqual(Object.keys(result.last).sort(), ['assisted', 'at', 'durationMs', 'errors']);
let writes = 0, recursive;
recursive = context.createPuzzleProgress('reentrant', { now: () => 0, storage: {
    getItem() { return null; },
    setItem() { writes++; recursive.mistake(); recursive.assist(); recursive.finish(); }
} });
assert.equal(recursive.finish().cleanSolves, 1);
assert.equal(writes, 1, 'Mark completion before calling storage');
assert.equal(recursive.finish(), undefined);
console.log('Puzzle progress: clean/assisted solves, unchanged schema and once-only storage passed');
