const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../js/modules/study/position_setup.js'), 'utf8');
const context = vm.createContext({require});
vm.runInContext(source.replace('export function', 'function'), context);
const fen = context.setupPositionFen;
assert.equal(fen('7k/5K2/6Q1/8/8/8/8/8', 'w'), '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1');
for (const board of [
    '8/8/8/8/8/8/8/8',
    '7k/8/5k2/8/8/8/8/K7',
    '8/8/8/8/8/8/4k3/4K3',
    '7k/8/7Q/8/8/8/8/K7',
    'P6k/8/8/8/8/8/8/K7'
]) assert.throws(() => fen(board, 'w'));
assert.equal(fen('7k/8/7Q/8/8/8/8/K7', 'b'), '7k/8/7Q/8/8/8/8/K7 b - - 0 1', 'The side to move may legally be in check');
assert(fen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', 'w').includes('KQkq'));
console.log('Position setup validation passed');
