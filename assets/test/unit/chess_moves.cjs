const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const context = vm.createContext({ require, console: { error() {} } });
require('./chess_moves_helper.cjs')(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/chess_utils.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export \{[^}]+\};/g, ''), context);
const { parseUciMove, moveToUci, playUciMove, inspectMove, uci_to_san, san_to_uci } = context;
const snapshot = board => JSON.stringify({ fen: board.fen(), history: board.history(), pgn: board.pgn(),
    repetition: board.in_threefold_repetition() });

for (const token of [null, undefined, '', '(none)', '0000', 'e9e4', 'e2e4qjunk', 'e2e4k', {}, 'e2 e4']) {
    const board = new Chess();
    board.move('e4');
    const before = snapshot(board);
    assert.equal(parseUciMove(token), null);
    assert.equal(playUciMove(board, token), null);
    assert.equal(snapshot(board), before);
}
for (const [fen, token, san] of [
    [new Chess().fen(), 'e2e4', 'e4'],
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', 'O-O'],
    ['r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8c8', 'O-O-O'],
    ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6', 'exd6']
]) {
    const board = new Chess(fen);
    const before = snapshot(board);
    const candidate = inspectMove(board, parseUciMove(token));
    assert.equal(candidate.san, san);
    assert.equal(moveToUci(candidate), token);
    assert.equal(snapshot(board), before, 'Inspecting a move must preserve the game');
    const played = playUciMove(board, token);
    assert.equal(played.san, san);
    assert.equal(board.history().length, 1);
}
for (const [fen, from, to] of [
    ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7', 'a8'],
    ['4k3/8/8/8/8/8/p7/4K3 b - - 0 1', 'a2', 'a1']
]) for (const promotion of ['q', 'r', 'b', 'n']) {
    const board = new Chess(fen);
    const token = from + to + promotion;
    const before = snapshot(board);
    const candidate = inspectMove(board, parseUciMove(token));
    assert.equal(candidate.promotion, promotion);
    assert.equal(moveToUci(candidate), token);
    assert.equal(snapshot(board), before);
    playUciMove(board, token);
    assert.equal(board.get(to).type, promotion);
}
const board = new Chess();
for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) board.move(san);
const before = snapshot(board);
assert.equal(inspectMove(board, { from: 'e2', to: 'e5' }), null);
assert.equal(uci_to_san(board, 'e2', 'e5'), null);
assert.equal(snapshot(board), before, 'Invalid input must not undo a previous move or erase repetition');
assert.equal(uci_to_san(board, 'e2', 'e4'), 'e4');
assert.equal(JSON.stringify(san_to_uci(board, 'e4')), '{"from":"e2","to":"e4"}');
assert.equal(snapshot(board), before);
console.log('Shared chess moves: invalid input, history, repetition, notation, castling, en passant and all promotions passed');
