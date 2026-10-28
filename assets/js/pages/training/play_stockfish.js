import { createBoardGame } from '../../modules/board/board_game.js';
import { playMoveSound } from '../../modules/sounds.js';
import { parseUciMove } from '../../modules/board/chess_moves.js';
import { turn_color, setup_chess, initial_fen } from '../../modules/board/chess_utils.js';
import { createUciEngine } from '../../modules/engine/uci_engine.js';
import { enginePosition } from '../../modules/engine/engine_position.js';
import { createTrainingLifecycle } from '../../modules/training/training_lifecycle.js';
import { onresize, resize_ground, setup_ground, setup_move_handler } from '../../modules/board/ground.js';
import { set_text, clear_all_text, error_div } from '../../modules/info_boxes.js';
require('regenerator-runtime/runtime');

let engineStartFen, engine, thinking = false, progressTimer;
const lifecycle = createTrainingLifecycle({ restore: () => { startRun(); ai_move(); } });
const boardGame = createBoardGame({ getPosition: () => chess, getBoard: () => ground,
    getOptions: () => ({ color, playable: !thinking && !chess.game_over() && turn_color(chess) === color }),
    onMove: playMoveSound });

function handle_move(orig, dest) {
    if (!lifecycle.run.active || thinking || turn_color(chess) !== color) return;
    if (move(orig, dest)) ai_move();
}

function move(orig, dest, promotion = 'q') {
    return !!boardGame.play({ from: orig, to: dest, promotion });
}

function clear_progress() {
    lifecycle.run.clearTimeout(progressTimer);
    const bar = document.getElementById('progress');
    bar.style.transitionDuration = '';
    bar.style.width = '0%';
    document.getElementById('progress_reason').innerText = '';
}

function animate_progress_bar(movetime, reason = '') {
    clear_progress();
    document.getElementById('progress_reason').innerText = reason;
    const bar = document.getElementById('progress');
    bar.style.transitionDuration = `${movetime / 1000}s`;
    bar.style.width = '100%';
    progressTimer = lifecycle.run.timeout(clear_progress, movetime);
}

async function ai_move() {
    const scope = lifecycle.run;
    if (!scope.active || thinking || chess.game_over() || turn_color(chess) === color) return;
    const position = chess, fen = position.fen(), currentEngine = engine;
    thinking = true;
    boardGame.restore();
    animate_progress_bar(1000, 'Calculating Move...');
    try {
        const result = await currentEngine.search(enginePosition(engineStartFen, position), { movetime: 1000, elo: null });
        if (!scope.active || chess !== position || chess.fen() !== fen) return;
        const candidate = parseUciMove(result.uci);
        if (!candidate || !move(candidate.from, candidate.to, candidate.promotion)) throw new Error('Invalid engine move');
    } catch (error) {
        if (scope.active) {
            console.error('Stockfish search failed:', error);
            set_text(error_div, 'Stockfish could not move. Reset or take back to retry.');
        }
    } finally {
        if (scope.active) {
            thinking = false;
            clear_progress();
            boardGame.restore();
        }
    }
}

function startRun() {
    const scope = lifecycle.reset();
    thinking = false;
    clear_progress();
    engine = createUciEngine();
    const currentEngine = engine;
    scope.use(() => currentEngine.dispose());
    setup_ground(chess.fen());
    const board = ground;
    scope.use(() => board.destroy());
    setup_move_handler(scope.guard(handle_move));
    boardGame.restore();
    resize_ground();
}

function reset(c) {
    const fen = initial_fen(chess);
    setup_chess(fen);
    engineStartFen = chess.fen();
    window.color = c;
    clear_all_text();
    startRun();
    ai_move();
}

function takeback() {
    // During a search only the player's latest ply needs to be undone.
    const count = turn_color(chess) === color ? 2 : 1;
    if (boardGame.undo(count).length !== count) return;
    clear_all_text();
    startRun();
}

function main(hash) {
    if (document.location.hash !== '') hash = document.location.hash.slice(1).replace(/%20/g, ' ');
    let [fen, first_move = 'p'] = hash.split(';');
    if (fen.endsWith('-')) fen = `${fen} 0 1`;
    setup_chess(fen);
    engineStartFen = chess.fen();
    window.color = turn_color(chess);
    if (first_move === 'sf') color = color === 'white' ? 'black' : 'white';
    startRun();
    ai_move();
}

lifecycle.page.listen(document.getElementById('reset_white'), 'click', () => reset('white'));
lifecycle.page.listen(document.getElementById('reset_black'), 'click', () => reset('black'));
lifecycle.page.listen(document.getElementById('takeback'), 'click', takeback);
lifecycle.page.listen(window, 'resize', onresize);
main('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1;p');
