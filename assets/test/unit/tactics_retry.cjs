const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const source = fs.readFileSync(require('node:path').join(__dirname, '../../js/tactics.js'), 'utf8');
const handler = source.slice(source.indexOf('async function play_move('), source.indexOf('function setup_last_move('));
(async () => {
    for (const status of ['rejected', 'unknown']) {
        const chess = new Chess();
        // Chessground switches to the opponent as soon as a user moves a piece.
        const state = {turnColor: 'black', movable: {color: 'white'}};
        const context = vm.createContext({
            chess, fen: chess.fen(), color: 'white', to_play: ['e4', 'e5', 'Nf3'],
            attempts: {validate: async () => ({status})},
            enginePosition: () => ({}), sleep: async () => {},
            clear_all_text() {}, set_text() {}, show_div() {},
            i18n: {}, info_div: 'info', error_div: 'error',
            ground: {set(update) {
                if (update.movable) Object.assign(state.movable, update.movable);
                if (update.turnColor) state.turnColor = update.turnColor;
            }},
            ground_undo_last_move() {state.fen = chess.fen();},
            ground_set_moves() {state.movable.dests = chess.moves();},
            ground_move(move, board) {state.turnColor = board.turn() === 'w' ? 'white' : 'black';}
        });
        vm.runInContext('let busy = false, finished = false, generation = 0, progress;\n' + handler, context);
        await context.play_move('d2', 'd4', 'q');
        assert.equal(chess.history().length, 0);
        assert.equal(state.turnColor, 'white', `${status}: restore the player's turn`);
        assert.equal(state.movable.color, 'white');
        assert(state.movable.dests.length > 0);
        await context.play_move('e2', 'e4', 'q');
        assert.equal(chess.history().join(' '), 'e4 e5', `${status}: allow a correct retry and opponent reply`);
        assert.equal(state.turnColor, 'white');
    }
    console.log('Incorrect and unconfirmed puzzle moves restore the player turn and allow a correct retry');
})().catch(error => {console.error(error); process.exitCode = 1;});
