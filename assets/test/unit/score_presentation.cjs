const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
const context = vm.createContext({});
vm.runInContext(read('modules/sparring/evaluation.js').replace(/^export /gm, ''), context);
vm.runInContext(read('components/evaluation_bar.js').replace(/^import .*\n/gm, '').replace(/^export /gm, ''), context);
const sparring = read('modules/sparring/study_adapter.js');
const start = sparring.indexOf('    function evaluation(score)');
vm.runInContext(sparring.slice(start, sparring.indexOf("    scope.listen(find('latest')", start)), context);
context.format = number => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(number);
for (const turn of ['w', 'b']) {
    for (const player of ['w', 'b']) {
        const same = turn === player;
        assert.equal(context.scoreForPlayer({ type: 'cp', value: 125 }, turn, player).value, same ? 125 : -125);
        for (const value of [0, 3, -3]) {
            const winning = value === 0 ? !same : (value > 0) === same;
            assert.equal(context.scoreForPlayer({ type: 'mate', value }, turn, player).winningMate, winning);
            assert.equal(context.winningChances({ type: 'mate', value }, turn, player), winning ? 100 : 0);
        }
    }
}
assert.equal(context.scoreForPlayer(null, 'w', 'w'), null);
assert.equal(context.winningChances(null, 'w', 'w'), null);
assert.equal(context.evaluationBarValue({ score: { type: 'cp', value: 125 }, turn: 'b' }).text, '-1.3');
assert.equal(context.evaluation({ type: 'cp', value: 125, turn: 'b' }), '-1,3', 'Keep locale-aware Sparring labels');
assert.equal(context.evaluation({ type: 'mate', value: 0, turn: 'b' }), '+#0');
assert.equal(context.evaluation({ type: 'mate', value: 0, turn: 'w' }), '−#0');
assert.equal(context.evaluationBarValue({ score: { type: 'mate', value: -3 }, turn: 'b' }).text, 'M3');
assert.equal(context.evaluationBarValue({ score: { type: 'mate', value: 0 }, turn: 'b' }).text, '#');
console.log('Score presentation: both perspectives, mate zero, probabilities and distinct locale/display policies passed');
