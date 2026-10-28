const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
for (const mode of ['tactics', 'chessclicker']) {
    const nodes = Object.fromEntries(Object.entries({ fen: 'first', color: 'white', moves: 'e4 e5', last_move: 'e7e5' })
        .map(([key, value]) => [key, { value }]));
    const context = vm.createContext({ document: { getElementById: key => nodes[key] }, ground: { state: {} } });
    for (const file of ['modules/board/chess_moves.js', 'modules/training/puzzle_data.js']) {
        vm.runInContext(read(file).replace(/^import .*\n/gm, '').replace(/^export /gm, ''), context);
    }
    vm.runInContext('let fen, color, moves, last_move;', context);
    const source = read(`pages/training/${mode}.js`);
    for (const name of ['load_data', 'setup_last_move']) {
        const start = source.indexOf(`function ${name}()`);
        vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
    }
    vm.runInContext('load_data(); setup_last_move();', context);
    assert.deepEqual(Array.from(context.ground.state.lastMove), ['e7', 'e5']);
    nodes.fen.value = 'second'; nodes.color.value = 'black'; nodes.moves.value = 'd4'; nodes.last_move.value = '';
    vm.runInContext('load_data(); setup_last_move();', context);
    assert.deepEqual(Array.from(vm.runInContext('[fen, color, moves, last_move]', context)), ['second', 'black', 'd4', '']);
    assert.equal(context.ground.state.lastMove, undefined, `${mode}: clear the previous highlight for an empty move`);
    for (const invalid of [null, undefined, 'e7', 'z7e5', 'e7e9', 'e7e5garbage']) {
        assert.equal(context.puzzleLastMove(invalid), undefined);
    }
    assert.deepEqual(Array.from(context.puzzleLastMove('a7a8q')), ['a7', 'a8']);
}
console.log('Puzzle input: both page adapters, LiveView replacement, lexical bindings and optional last moves passed');
