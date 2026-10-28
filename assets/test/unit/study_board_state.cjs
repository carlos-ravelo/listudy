const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
const source = read('pages/study/study.js');
const start = source.indexOf('function setup_move()');
const setup = source.slice(start, source.indexOf('\n/*', start));
const noop = () => {};

for (const color of ['white', 'black']) for (const reading of [false, true]) {
    const chess = new Chess();
    if (color === 'black') chess.move('e4');
    const board = { orientation: color, movable: {} };
    let sparringRenders = 0;
    const context = vm.createContext({
        chess, Map, readMode: reading, trap: null, currentTacticsTrap() { return context.trap; },
        sparring: null, studyRun: { replaying: false }, failedPositionRun: null,
        spacedReviewRunActive: false, weakChapterRunActive: false, smartSession: null, smartTarget: null,
        visualization: { block: noop, render: noop }, updateContextReplayUi: noop,
        overlay_manager: { clear_overlays: noop }, studyMoveNavigation: { update: noop },
        publishStudyComments: noop, change_play_stockfish: noop, change_analysis_board: noop,
        display_arrows: noop, show_suggestions: noop, display_comments: noop, update_read_mode_ui: noop,
        ground: { set(update) {
            const { movable, ...fields } = update;
            Object.assign(board, fields);
            if (movable) Object.assign(board.movable, movable);
        }, setShapes: noop }
    });
    vm.runInContext(read('modules/board_interaction.js').replace(/^export /gm, '') + '\n' + setup, context);
    const assertPlayable = () => {
        assert.equal(board.fen, chess.fen());
        assert.equal(board.turnColor, chess.turn() === 'w' ? 'white' : 'black');
        assert.equal(board.movable.color, 'both', 'Study handles authored continuations for either side');
        assert(board.movable.dests.size > 0);
        assert.equal(board.orientation, color);
    };
    context.setup_move();
    assertPlayable();
    context.studyRun.replaying = true;
    chess.move(chess.moves()[0]);
    context.setup_move();
    assert.equal(board.fen, chess.fen());
    assert.equal(board.movable.color, undefined);
    assert.equal(board.movable.dests.size, 0);
    context.studyRun.replaying = false;
    context.setup_move();
    assertPlayable();
    const trapBoard = new Chess();
    trapBoard.move('d4');
    context.trap = { board: trapBoard };
    context.setup_move();
    assert.equal(board.fen, trapBoard.fen());
    assert.equal(board.movable.color, undefined);
    assert.equal(board.movable.dests.size, 0);
    context.trap = null;
    context.setup_move();
    assertPlayable();
    context.sparring = { active: true, render() { sparringRenders++; } };
    context.setup_move();
    assert.equal(sparringRenders, 1);
    assertPlayable();
}
console.log('Study board state: both orientations, Read/practice, replay, trap recovery and Sparring delegation passed');
