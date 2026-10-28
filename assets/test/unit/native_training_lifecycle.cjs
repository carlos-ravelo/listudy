const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const createPageScope = require('./page_scope_helper.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
const source = read('pages/training/tactics.js');
const main = source.slice(source.indexOf('function main('), source.indexOf('lifecycle.page.listen(document, "phx:update"'));
const events = new EventTarget();
const counts = { boards: 0, pickers: 0, stops: 0, inputs: 0, starts: 0 };
const nodes = Object.fromEntries(['fen', 'moves', 'last_move', 'puzzle_identity', 'puzzle_attempt', 'next', 'solution'].map(id => [id, {
    value: id === 'fen' ? new Chess().fen() : id === 'moves' ? 'e4 e5 Nf3' : id,
    hidden: true, classList: { add() {} }, removeAttribute() {}
}]));
const context = vm.createContext({
    createPageScope, autoplay: { refresh() {}, cancel() {}, reset() {} },
    document: { getElementById: id => nodes[id], querySelector: () => ({}) },
    exercise: { stop() { counts.stops++; }, reset() {} },
    busy: false, finished: false, picker: null, fen: nodes.fen.value, color: 'white', moves: nodes.moves.value,
    clear_all_text() {}, load_data() {}, createPuzzleProgress() {}, show_which_side() {}, setup_last_move() {},
    ground_set_moves() {}, resize_ground() {}, setup_chess(fen) { context.chess = new Chess(fen); },
    setup_ground() {
        counts.starts++;
        context.ground = { state: { dom: { elements: { board: { isConnected: true } } } },
            set() {}, destroy() { counts.boards++; } };
    },
    setup_move_handler(handler) { context.input = handler; }, handle_move() { counts.inputs++; },
    createPromotionController() { return { destroy() { counts.pickers++; } }; }
});
context.window = context;
vm.runInContext(read('modules/training_lifecycle.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
context.lifecycle = context.createTrainingLifecycle({ events, restore: () => context.main(true) });
vm.runInContext(main, context);
context.main();
const oldInput = context.input;
context.main();
assert.equal(counts.starts, 1, 'A LiveView update for the same mounted puzzle must retain its exercise');
nodes.puzzle_attempt.value = 'next';
context.main();
assert.equal(counts.starts, 2);
assert.equal(counts.boards, 1); assert.equal(counts.pickers, 1); assert.equal(counts.stops, 1);
oldInput(); assert.equal(counts.inputs, 0);
context.input(); assert.equal(counts.inputs, 1);
const hide = new Event('pagehide'); hide.persisted = true; events.dispatchEvent(hide);
assert.equal(counts.boards, 2); assert.equal(counts.pickers, 2); assert.equal(counts.stops, 2);
const show = new Event('pageshow'); show.persisted = true; events.dispatchEvent(show);
assert.equal(counts.starts, 3, 'Cached restoration remounts even when the old board DOM is still connected');
delete nodes.fen;
context.main();
assert.equal(counts.boards, 3); assert.equal(counts.pickers, 3); assert.equal(counts.stops, 3);
context.lifecycle.destroy();
console.log('Native trainer lifecycle: duplicate updates, next puzzle, cached return, removed content and stale input passed');
