const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const context = vm.createContext({require});
for (const name of ['engine_position', 'tactic_alternatives']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules', name + '.js'), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, ''), context);
}
const {createTacticAlternatives, enginePosition} = context;
(async () => {
    const board = new Chess('7k/5K2/6Q1/8/8/8/8/8 w - - 0 1');
    const state = enginePosition(board.fen(), board);
    const validator = createTacticAlternatives({createEngine: () => ({dispose() {}, assess() {assert.fail('Immediate mate needs no API');}})});
    assert.equal((await validator.validate(state, 'g6g7', 'g6h6', 1)).status, 'accepted', 'Accept an alternative immediate mate');
    assert.equal((await validator.validate(state, 'g6g7', 'g6f5', 1)).status, 'rejected', 'Stalemate does not solve a mating exercise');
    const initial = new Chess();
    const initialState = enginePosition(initial.fen(), initial);
    let disposal = 0;
    const local = {dispose() {disposal++;}, assess: async () => null,
        analyze: async state => ({depth: 20, score: {type: 'cp', value: state.moves.at(-1) === 'd2d4' ? -490 : -500}, pv: ['e7e5', 'g1f3']})};
    const cp = createTacticAlternatives({createEngine: () => local});
    const accepted = await cp.validate(initialState, 'e2e4', 'd2d4', 3);
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.line.join(' '), 'd2d4 e7e5 g1f3', 'Replace the continuation after the alternative');
    local.analyze = async () => ({depth: 5, score: {type: 'cp', value: -500}});
    assert.equal((await cp.validate(initialState, 'e2e4', 'd2d4', 1)).status, 'unknown', 'Shallow analysis never rejects a legal alternative');
    local.analyze = async state => ({depth: 20, score: {type: 'cp', value: state.moves.at(-1) === 'd2d4' ? 0 : -500}});
    assert.equal((await cp.validate(initialState, 'e2e4', 'd2d4', 1)).status, 'rejected');
    local.analyze = async () => {throw Error('Offline');};
    assert.equal((await cp.validate(initialState, 'e2e4', 'd2d4', 1)).status, 'unknown', 'Unavailable engine preserves authored-line fallback');
    local.assess = async (state, uci) => ({after: uci === 'd2d4' ? 50 : 100});
    assert.equal((await cp.validate(initialState, 'e2e4', 'd2d4', 1)).status, 'rejected', 'Exact win-to-draw alternative is rejected');
    local.assess = async () => ({after: 100});
    local.bestMove = async () => 'e7e5';
    assert.equal((await cp.validate(initialState, 'e2e4', 'd2d4', 2)).line.join(' '), 'd2d4 e7e5');
    let release;
    local.assess = () => new Promise(resolve => {release = resolve;});
    const pending = cp.validate(initialState, 'e2e4', 'd2d4', 1);
    cp.reset(); release({after: 100});
    // Subsequent work must not use a disposed engine.
    local.assess = async () => ({after: 100});
    assert.equal((await pending).status, 'unknown');
    assert.equal(disposal, 1);
    console.log('Alternative mates, stalemate rejection, confidence, exact outcomes, continuations, offline fallback and cancellation passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
