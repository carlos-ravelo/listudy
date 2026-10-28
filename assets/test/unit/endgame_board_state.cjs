const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
const source = read('pages/training/endgames.js');
const ready = source.slice(source.indexOf('function boardReady()'), source.indexOf('function finish('));

for (const color of ['white', 'black']) {
    const chess = new Chess();
    if (color === 'black') chess.move('e4');
    const controls = {};
    const state = { fen: 'review-position', movable: {} };
    const context = vm.createContext({
        chess, color, Map, ended: false, reviewing: false, busy: false, picker: { pending: null },
        feedback: { rows: [] },
        document: { getElementById(id) { return controls[id] ||= {}; } },
        ground: { set(update) {
            const { movable, ...fields } = update;
            Object.assign(state, fields);
            if (movable) Object.assign(state.movable, movable);
        } }
    });
    vm.runInContext(read('modules/board_interaction.js').replace(/^export /gm, '') + '\n' + ready, context);
    context.boardReady();
    assert.equal(state.movable.color, color);
    assert(state.movable.dests.size > 0);
    for (const blocker of ['ended', 'reviewing', 'busy', 'promotion', 'opponent']) {
        if (blocker === 'promotion') context.picker.pending = { from: 'a7', to: 'a8' };
        else if (blocker === 'opponent') chess.move(chess.moves()[0]);
        else context[blocker] = true;
        context.boardReady();
        assert.equal(state.movable.color, undefined, `${blocker}: disable input`);
        assert.equal(state.movable.dests.size, 0, `${blocker}: clear destinations`);
        assert.equal(state.fen, 'review-position', `${blocker}: preserve the visible position`);
        if (blocker === 'promotion') context.picker.pending = null;
        else if (blocker === 'opponent') chess.undo();
        else context[blocker] = false;
        context.boardReady();
        assert.equal(state.movable.color, color, `${blocker}: resume input`);
        assert(state.movable.dests.size > 0);
    }
}
console.log('Endgame board state: both colors, pending promotion, engine work, review, finish and resume passed');
