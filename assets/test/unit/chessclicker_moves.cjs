const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const source = fs.readFileSync(path.join(__dirname, '../../js/chessclicker.js'), 'utf8');
const handler = source.slice(source.indexOf('async function handle_move('), source.indexOf('function setup_last_move('));
const chess = new Chess();
const state = { movable: {} };
let next = 0, solved = 0;
const context = vm.createContext({
    chess, to_play: ['e4', 'e5', 'Nf3'], flash_info() {}, next_puzzle() { next++; }, tactic_solved() { solved++; },
    ground: { set(update) {
        const { movable, ...fields } = update;
        Object.assign(state, fields);
        if (movable) Object.assign(state.movable, movable);
    } }
});
require('./board_game_helper.cjs')(context);
require('./line_exercise_helper.cjs')(context, { applyOptions: {} });
context.uci_to_san = (position, from, to) => context.inspectMove(position, { from, to, promotion: 'q' })?.san || null;
vm.runInContext(handler, context);
(async () => {
await context.handle_move('e2', 'e5');
assert.equal(chess.history().length, 0);
assert.equal(next, 0);
await context.handle_move('d2', 'd4');
assert.equal(chess.history().length, 0);
assert.equal(context.exercise.remaining.join(' '), 'e2e4 e7e5 g1f3');
assert.equal(state.fen, chess.fen());
assert.equal(next, 1);
await context.handle_move('e2', 'e4');
assert.equal(chess.history().join(' '), 'e4 e5');
assert.equal(state.fen, chess.fen());
assert.equal(state.turnColor, 'white');
await context.handle_move('g1', 'f3');
assert.equal(chess.history().join(' '), 'e4 e5 Nf3');
assert.equal(solved, 1);
assert.equal(next, 2);
console.log('Chessclicker: shared movement preserves invalid input, retry, authored reply and solve rewards');

})().catch(error => { console.error(error); process.exitCode = 1; });
