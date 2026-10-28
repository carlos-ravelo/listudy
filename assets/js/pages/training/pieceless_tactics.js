import { createTrainingLifecycle } from '../../modules/training/training_lifecycle.js';
import { createLineExercise } from '../../modules/training/line_exercise.js';
import { createBoardGame } from '../../modules/board/board_game.js';
import { playMoveSound } from '../../modules/sounds.js';
import { playUciMove } from '../../modules/board/chess_moves.js';
import { blockBoardMoves, restoreBoardPosition } from '../../modules/board/board_interaction.js';
require("regenerator-runtime/runtime"); // required for sleep (https://github.com/babel/babel/issues/9849#issuecomment-487040428)

const Chessground = require('chessground').Chessground;
import { onresize, resize_ground, setup_ground, ground_set_moves,
         setup_move_handler, setup_click_handler } from '../../modules/board/ground.js';
import { ground_legal_moves, turn_color, setup_chess, uci_to_san, san_to_uci } from '../../modules/board/chess_utils.js';
import { set_text, clear_all_text, success_div, info_div, error_div, suggestion_div } from '../../modules/info_boxes.js';
import { createTacticAttempts } from '../../modules/training/tactic_attempts.js';
import { createPromotionController } from '../../modules/board/promotion_controller.js';
import { setupNativeVisualization, createPieceMask } from '../../modules/training/native_visualization.js';
let finished = false, picker;
const visualization = setupNativeVisualization('pieceless');
let pieceMask;
const boardGame = createBoardGame({ getPosition: () => chess, getBoard: () => ground,
    getOptions: () => ({ check: false }),
    onMove(move) { pieceMask.move(move); playMoveSound(move); } });
const exercise = createLineExercise({ getPosition: () => chess, applyMove: uci => boardGame.play(uci),
    validator: createTacticAttempts() });
const sourceSolution = solution;
const lifecycle = createTrainingLifecycle({ restore: () => main() });
lifecycle.page.use(visualization);

function show_history(chess) {
    // unhide the container
    // this is needed because "History:" is hidden this way before the first move is made
    document.getElementById("history_container").classList.remove("hidden");
    // this is the span inside of history_container
    let d = document.getElementById("history");
    let history = chess.history().join(" ");
    d.innerText = history;
}

function finish(reveal = false, solved = false) {
    if (finished) return;
    exercise.stop();
    visualization.tracker.end(solved, !solved);
    finished = true;
    document.getElementById('next').classList.remove('hidden');
    if (reveal) {
        for (const move of exercise.remaining) playUciMove(chess, move);
        document.querySelector('.pieceless-workspace').classList.add('training-revealed');
    }
    restoreBoardPosition(ground, chess, { playable: false, check: reveal && chess.in_check() });
    show_history(chess);
}
async function play_move(orig, dest, promotion) {
    if (exercise.pending || finished) return;
    const ticket = exercise.revision;
    const result = await exercise.play({from: orig, to: dest, promotion}, {
        onChecking() {
            blockBoardMoves(ground);
            set_text(info_div, i18n.checking);
        },
        onPlayerMove() { visualization.tracker.decision(true); }
    });
    if (!result || !exercise.isCurrent(ticket)) return;
    clear_all_text();
    if (result.status !== 'accepted') {
        if (result.status === 'rejected') visualization.tracker.decision(false);
        boardGame.restore();
        if (result.status !== 'illegal') set_text(result.status === 'unknown' ? info_div : error_div, result.status === 'unknown' ? i18n.unconfirmed : i18n.wrong_move);
        return;
    }
    if (result.complete) {
        set_text(success_div, i18n.solved);
        finish(true, true);
    } else set_text(success_div, i18n.right_move);
    show_history(chess);
}
function handle_move(orig, dest) {
    if (finished || exercise.pending || picker?.pending) return;
    clear_all_text();
    if (!picker.request({from: orig, to: dest, legal: chess.moves({verbose: true}), color: window.color, orientation: ground.state.orientation})) {
        play_move(orig, dest);
    }
}

function num_to_file(num) {
    let to_return = "ERROR in num_to_file";
    num = Number(num);
    switch (num) {
        case 0: to_return = "a"; break; 
        case 1: to_return = "b"; break;
        case 2: to_return = "c"; break;
        case 3: to_return = "d"; break;
        case 4: to_return = "e"; break;
        case 5: to_return = "f"; break;
        case 6: to_return = "g"; break;
        case 7: to_return = "h"; break;
    }
    return to_return;
}

function expand_abbreviation(type) {
    let to_return = "ERROR in expand_abbreviation";

    switch (type) {
        case "k": to_return = "king"; break;
        case "q": to_return = "queen"; break;
        case "r": to_return = "rook"; break;
        case "n": to_return = "knight"; break;
        case "b": to_return = "bishop"; break;
        case "p": to_return = "pawn"; break;
    }
    return to_return;
}

function display_piece(piece) {
    let piece_color = piece.color == "w" ? "white" : "black";
    let piece_type = expand_abbreviation(piece.type);

    let d = document.createElement("div"); //container
    let p = document.createElement("piece"); //piece display
    let s = document.createElement("div"); //square of piece
    p.classList.add(piece_color);
    p.classList.add(piece_type);
    p.classList.add("chessground_piece"); // 45px width height and background size
    s.innerText = piece.square;
    s.classList.add("pieceless_piece_square");
    d.classList.add("pieceless_piece_container");
    d.appendChild(s);
    d.appendChild(p);
    document.getElementById("pieceless_pieces").appendChild(d);
}

function setup_pieces(chess) {
    let pieces = [];
    let board = chess.board();
    for (let rank in board) {
        for (let file in board[rank]) {
            if (board[rank][file] != null) {
                let r = Number(rank);
                let f = Number(file);
                f = num_to_file(f);
                r = 8-r;
                let piece = board[rank][file];
                piece.square = f+r;

                pieces.push(piece);
            }
        }
    }

    for (let piece of pieces) {
        display_piece(piece);
    }
}

function setup_to_play(chess) {
    let to_play = chess.turn() == "w" ? i18n.white : i18n.black;
    document.getElementById("pieceless_to_play").innerText = to_play;
}

function main() {
    if (!lifecycle.page.active) return;
    const scope = lifecycle.reset();
    scope.use(() => exercise.stop());
    exercise.reset();
    finished = false;
    clear_all_text();
    document.getElementById('next').classList.add('hidden');
    document.getElementById('history_container').classList.add('hidden');
    document.getElementById('pieceless_pieces').replaceChildren();
    document.querySelector('.pieceless-workspace').classList.remove('training-revealed');
    setup_chess(fen);
    exercise.reset({ initialFen: fen, moves: sourceSolution,
        format: document.querySelector('.pieceless-workspace').dataset.solutionFormat });
    setup_pieces(chess); setup_to_play(chess);
    window.color = chess.turn() === 'w' ? 'white' : 'black';
    setup_ground(fen); scope.use(ground); ground_set_moves();
    ground.set({animation: {enabled: false}, check: false, movable: {showDests: visualization.destinations.checked}, draggable: {enabled: false}});
    const pieces = [...ground.state.pieces].sort(([a, pieceA], [b, pieceB]) =>
        (pieceA.role === 'king') - (pieceB.role === 'king') || a.localeCompare(b));
    const requested = visualization.target;
    const count = Math.min(requested, pieces.length);
    document.querySelector('.pieceless-workspace').classList.toggle('training-partial', count < pieces.length);
    pieceMask = scope.use(createPieceMask(document.getElementById('chessground'), pieces.slice(0, count).map(([square]) => square)));
    visualization.begin(fen + '|' + sourceSolution, requested, count);
    setup_move_handler(scope.guard(handle_move));
    setup_click_handler(scope.guard(square => {
        if (!finished && visualization.destinations.checked && ground_legal_moves(chess).has(square)) visualization.help();
    }));
    picker = scope.use(createPromotionController({element: document.querySelector('[data-promotion-picker]'),
        onOpen() { restoreBoardPosition(ground, chess, { playable: false, check: false }); },
        onChoose(promotion, move) { play_move(move.from, move.to, promotion); },
        onCancel() { restoreBoardPosition(ground, chess, { check: false }); }}));
    resize_ground();
    scope.assign(document.getElementById('give-up'), 'onclick', () => { if (!finished) finish(true); });
    scope.assign(document.getElementById('training_restart'), 'onclick', main);
}

lifecycle.page.assign(window, 'onresize', onresize);
lifecycle.page.listen(window, 'native-visualization-destinations', event => ground.set({movable: {showDests: event.detail.enabled}}));
main();
