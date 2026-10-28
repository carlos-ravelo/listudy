const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const { moveArrow, moveArrows } = require('./board_shapes_helper.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end));
assert.deepEqual(plain(moveArrow('e2e4')), { orig: 'e2', dest: 'e4', brush: 'normal' });
for (const role of ['q', 'r', 'b', 'n']) {
    for (const [from, to] of [['a7', 'a8'], ['h2', 'h1']]) {
        const expected = { orig: from, dest: to, brush: 'pgn_green' };
        assert.deepEqual(plain(moveArrow(from + to + role, 'pgn_green')), expected);
        assert.deepEqual(plain(moveArrow({ from, to, promotion: role }, 'pgn_green')), expected);
    }
}
const invalid = [null, undefined, '', '0000', '(none)', 'a1a1', 'a0a2', 'e2e4garbage', 'e2e4qextra', 'e2e4 ', {}, { from: 'z2', to: 'a1' }];
for (const move of invalid) assert.equal(moveArrow(move), null);
assert.deepEqual(plain(moveArrows(['e1g1', null, 'e8c8'], 'green')), [
    { orig: 'e1', dest: 'g1', brush: 'green' }, { orig: 'e8', dest: 'c8', brush: 'green' }
]);

// Exercise the real review handlers: empty/invalid hints must clear an older arrow.
const endgame = read('pages/training/endgames.js');
const select = between(endgame, 'function selectReview(', 'function renderEvaluation()');
const startFen = new Chess().fen();
for (const uci of ['e2e4', 'a7a8n', ...invalid]) {
    const shapes = [], nodes = {};
    const row = { ply: 0, san: 'e4', status: 'done', beforeAnalysis: { uci } };
    const context = vm.createContext({ Chess, startFen, moves: [], feedback: { rows: [row] }, reviewing: true,
        selectedRow: null, reviewRoot: [], gameId: 1, moveArrows,
        hintTasks: { cancel() {} }, ground: { setAutoShapes: value => shapes.push(plain(value)) },
        restoreBoardPosition() {}, updateFen() {}, refreshReviewEvaluation() {}, moveTree: { update() {} }, renderEvaluation() {},
        endgameAssessmentCertain: () => true, continuation: () => '', labels: { before: '{move}', suggestion: 'Suggestion' },
        document: { getElementById: id => nodes[id] ||= {} }
    });
    require('./chess_moves_helper.cjs')(context);
    vm.runInContext(select, context);
    context.selectReview([]);
    const expected = plain(moveArrows([uci], 'pgn_green'));
    assert.deepEqual(shapes.at(-1), expected, 'Selecting a review uses the shared hint validation');
    context.selectedRow = null;
    context.renderComment();
    assert.deepEqual(shapes.at(-1), [], 'An unanalysed review cannot retain a preceding hint');
}
const sparring = read('modules/sparring/study_adapter.js');
const showBest = between(sparring, "        find('show-best').onclick =", "        find('retry-selected').onclick");
for (const best of ['e7e5', 'a2a1n', ...invalid]) {
    const control = {}, shapes = [], seeks = [];
    const context = vm.createContext({ row: { best, ply: 3 }, find: () => control, moveArrows,
        board: { setShapes: value => shapes.push(plain(value)) }, seek: ply => seeks.push(ply) });
    vm.runInContext(showBest, context);
    control.onclick();
    assert.deepEqual(seeks, [3]);
    assert.deepEqual(shapes[0], plain(moveArrows([best])), 'Sparring uses the same validation with its existing brush/channel');
}

const updates = [], element = { dataset: {} };
const replayContext = vm.createContext({ moveArrow, require(name) {
    return name === 'chessground' ? { Chessground: () => ({ set: value => updates.push(value) }) } : require(name);
} });
vm.runInContext(read('modules/analysis/game_replay.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), replayContext);
const replay = replayContext.createGameReplay(element, '1. e4 e5 2. Nf3 Nc6');
const position = new Chess(); position.move('e4');
replay.select({ ply: 1, fen: position.fen(), expected: ['c5', 'invalid'], played: 'e5' }, 'black');
assert.deepEqual(plain(updates.at(-1).drawable.shapes), [
    { orig: 'c7', dest: 'c5', brush: 'green' }, { orig: 'e7', dest: 'e5', brush: 'red' }
]);
assert.equal(replay.ply, 1);
replay.seek(2);
assert.deepEqual(plain(updates.at(-1).drawable.shapes), [], 'Leaving the comparison clears its hints');
console.log('Board hints: strict coordinates, promotions, review clearing, Sparring and analysis replay passed');
