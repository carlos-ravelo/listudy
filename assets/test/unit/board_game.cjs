const assert = require('node:assert/strict');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

for (const [fen, line] of [
    [new Chess().fen(), ['e2e4', 'e7e5']],
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1', 'e8c8']],
    ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['e5d6', 'e8d7']],
    ['4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', ['e4d5', 'e8d7']],
    ...['q', 'r', 'b', 'n'].map(role => ['7k/P7/8/8/8/8/8/7K w - - 0 1', ['a7a8' + role]])
]) {
    const position = new Chess(fen);
    const reference = new Chess(fen);
    const moves = [];
    const state = { movable: { showDests: false, events: { after() {} } }, orientation: 'black' };
    const context = vm.createContext({ chess: position, ground: { set(update) {
        const { movable, ...fields } = update;
        Object.assign(state, fields);
        if (movable) Object.assign(state.movable, movable);
    } } });
    const game = require('./board_game_helper.cjs')(context, { options: {}, onMove(move) { moves.push(move); } });
    for (const input of line) {
        const expected = context.playUciMove(reference, input);
        const played = game.play(input, { playable: false });
        assert.equal(played.san, expected.san);
        assert.equal(position.fen(), reference.fen());
        assert.equal(state.fen, position.fen());
        assert.equal(state.turnColor, position.turn() === 'w' ? 'white' : 'black');
        assert.equal(state.movable.dests.size, 0);
        assert.equal(state.movable.color, undefined);
    }
    const after = position.fen();
    assert.equal(game.undo(line.length + 1).length, 0);
    assert.equal(position.fen(), after, 'Insufficient history must not partially undo a turn');
    for (const count of [0, -1, 1.5, NaN]) assert.equal(game.undo(count).length, 0);
    assert.equal(game.undo(line.length).length, line.length);
    assert.equal(position.fen(), fen);
    assert.equal(state.fen, fen, 'Restore captured pieces, castling rooks and promoted pawns from the game');
    assert.equal(state.movable.color, position.turn() === 'w' ? 'white' : 'black');
    assert.equal(state.movable.showDests, false);
    assert.equal(state.orientation, 'black');
    assert.equal(moves.length, line.length, 'Undo must not emit new move effects');
    position.move(position.moves()[0]);
    const history = position.history().join(' ');
    state.fen = 'uncommitted-drag';
    assert.equal(game.play({ from: 'a1', to: 'a8' }), null);
    assert.equal(position.history().join(' '), history, 'Rejecting input must not undo an earlier move');
    assert.equal(state.fen, position.fen(), 'Restore an invalid optimistic board move');
    assert.equal(moves.length, line.length);
    context.chess = new Chess();
    game.play('d4');
    assert.equal(context.chess.history().join(' '), 'd4', 'Use the current game after a reset');
    assert.equal(position.history().join(' '), history);
}
console.log('Board game: shared apply/undo, castling, captures, en passant, promotions, invalid input and replaced positions passed');
