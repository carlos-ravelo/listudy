const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const source = fs.readFileSync(path.join(__dirname, '../../js/train_mistakes.js'), 'utf8');
const handler = source.slice(source.indexOf('    function onMove('), source.indexOf('    function updateUrl('));

for (const [fen, from, to, expected] of [
    [new Chess().fen(), 'd2', 'd4', 'e4'],
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1', 'g1', 'Ra2'],
    ['4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'e4', 'd5', 'Kd1']
]) {
    const chess = new Chess(fen);
    const item = { id: 'position' }, mistake = { fen };
    const grades = [], timers = [];
    const state = { movable: {} };
    const context = vm.createContext({
        chess, Map, sessionOpen: true, resetTimer: undefined, currentIndex: 0,
        queue: [mistake], references: new Map([[mistake, item]]), solved: new Set(), attempts: new Map(), assisted: false,
        positionKey: () => 'position', expectedMoves: () => [expected], grade(san, correct) { grades.push([san, correct]); },
        feedback() {}, updateButtons() {}, setTimeout(callback) { timers.push(callback); return timers.length; },
        ground: { set(update) {
            const { movable, ...fields } = update;
            Object.assign(state, fields);
            if (movable) Object.assign(state.movable, movable);
        } }
    });
    require('./board_game_helper.cjs')(context, { options: {} });
    vm.runInContext(handler, context);
    context.onMove(from, to);
    assert.equal(grades.length, 1);
    assert.equal(grades[0][1], false);
    assert.equal(state.fen, chess.fen());
    assert.equal(state.movable.color, undefined);
    context.onMove(from, to);
    assert.equal(grades.length, 1, 'Ignore input while a retry is pending');
    timers[0]();
    assert.equal(chess.fen(), fen);
    assert.equal(state.fen, fen);
    assert.equal(state.turnColor, 'white');
    assert.equal(state.movable.color, 'white');
    const correct = context.inspectMove(chess, expected);
    context.onMove(correct.from, correct.to);
    assert.equal(grades[1][1], true);
    assert(context.solved.has('position'));
    assert.equal(state.fen, chess.fen());
    assert.equal(state.movable.color, undefined);
}
console.log('Game practice rollback: repeated input, captures, castling, retry and accepted moves passed');
