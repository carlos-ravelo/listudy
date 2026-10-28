const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const context = vm.createContext({ Map });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/board_interaction.js'), 'utf8')
    .replace(/^export /gm, ''), context);
const { blockBoardMoves, restoreBoardPosition, setBoardInteraction } = context;
const serialize = value => JSON.parse(JSON.stringify(value));

for (const fen of [
    new Chess().fen(),
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
    '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
    '4k3/8/8/8/8/8/p7/4K3 b - - 0 1',
    '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1',
    'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
    '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'
]) {
    const position = new Chess(fen);
    const after = () => {};
    const board = { state: {
        fen: 'stale', turnColor: 'stale', check: 'stale', lastMove: ['a1', 'a8'],
        movable: { free: true, color: 'both', showDests: false, events: { after } },
        draggable: { enabled: false }, orientation: 'black'
    }, set(update) {
        const { movable, ...fields } = update;
        Object.assign(this.state, fields);
        if (movable) Object.assign(this.state.movable, movable);
    } };
    for (let retry = 0; retry < 2; retry++) {
        blockBoardMoves(board);
        assert.equal(board.state.movable.color, undefined);
        assert.equal(board.state.movable.free, false);
        assert.equal(board.state.movable.dests.size, 0);
        restoreBoardPosition(board, position);
        assert.equal(board.state.fen, fen);
        const color = position.turn() === 'w' ? 'white' : 'black';
        assert.equal(board.state.turnColor, color);
        assert.equal(board.state.movable.color, color);
        assert.equal(board.state.check, position.in_check());
        const legal = position.moves({ verbose: true });
        const expected = new Set(legal.map(move => move.from + move.to));
        const actual = [];
        for (const [from, targets] of board.state.movable.dests) for (const to of targets) actual.push(from + to);
        assert.equal(actual.length, expected.size, 'Promotion variants share one destination');
        assert.deepEqual(new Set(actual), expected);
        assert.equal(board.state.movable.showDests, false);
        assert.equal(board.state.movable.events.after, after);
        assert.equal(board.state.draggable.enabled, false);
        assert.equal(board.state.orientation, 'black');
    }
    const first = position.moves({ verbose: true })[0];
    if (first) {
        position.move(first);
        restoreBoardPosition(board, position);
        assert.deepEqual(serialize(board.state.lastMove), [first.from, first.to]);
    }
    restoreBoardPosition(board, position, { playable: false, lastMove: null });
    assert.equal(board.state.lastMove, undefined);
    assert.equal(board.state.movable.color, undefined);
    assert.equal(board.state.movable.dests.size, 0);
    board.state.fen = 'visible-position';
    setBoardInteraction(board, position, { playable: false, check: false });
    assert.equal(board.state.fen, 'visible-position', 'Changing interactivity must preserve the visible position');
    assert.equal(board.state.check, false, 'Visualization modes can hide check');
    assert.equal(position.history().length, first ? 1 : 0, 'Rendering never mutates the game');
}
console.log('Shared board interaction: both colors, promotion, check, castling, en passant, review and retry passed');
