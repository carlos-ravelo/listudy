require("regenerator-runtime/runtime"); // required for sleep (https://github.com/babel/babel/issues/9849#issuecomment-487040428)

const Chessground = require('chessground').Chessground;
const Chess = require('chess.js')
import { onresize, resize_ground, setup_ground, ground_set_moves,
         ground_undo_last_move, setup_move_handler, setup_click_handler, ground_move } from './modules/ground.js';
import { ground_legal_moves, turn_color, setup_chess, uci_to_san, san_to_uci } from './modules/chess_utils.js';
import { set_text, clear_all_text, success_div, info_div, error_div, suggestion_div } from './modules/info_boxes.js';
import { createTacticAlternatives } from './modules/tactic_alternatives.js';
import { enginePosition } from './modules/engine_position.js';
const alternatives = createTacticAlternatives();
let validating = false, generation = 0;
import { createPromotionPicker } from './modules/promotion_picker.js';
import { setupNativeVisualization, createPieceMask } from './modules/native_visualization.js';
let finished = false, picker;
const visualization = setupNativeVisualization('pieceless');
let pieceMask;
const sourceSolution = solution;
let pendingPromotion;

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
    alternatives.reset();
    visualization.tracker.end(solved, !solved);
    finished = true;
    document.getElementById('next').classList.remove('hidden');
    if (reveal) {
        for (const move of solution) chess.move({from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4]});
        document.querySelector('.pieceless-workspace').classList.add('training-revealed');
    }
    ground.set({fen: chess.fen(), check: reveal && chess.in_check(), movable: {color: undefined, dests: new Map()}});
    show_history(chess);
}
async function play_move(orig, dest, promotion) {
    if (validating || finished) return;
    const ticket = generation;
    const expected = solution[0];
    const played = orig + dest + (promotion || '');
    if (played !== expected) {
        validating = true;
        ground.set({movable: {dests: new Map()}});
        set_text(info_div, i18n.checking);
        const result = await alternatives.validate(enginePosition(fen, chess), expected, played, solution.length);
        if (ticket !== generation || finished) return;
        validating = false;
        clear_all_text();
        if (result.status === 'accepted') solution = result.line;
        else {
        if (result.status === 'rejected') visualization.tracker.decision(false);
        ground.set({fen: chess.fen()}); ground_set_moves();
        set_text(result.status === 'unknown' ? info_div : error_div, result.status === 'unknown' ? i18n.unconfirmed : i18n.wrong_move);
        return;
        }
    }
    const move = chess.move({from: orig, to: dest, promotion});
    visualization.tracker.decision(true);
    pieceMask.move(move);
    ground_move(move, chess);
    solution.shift();
    if (solution.length > 1) {
        const reply = solution.shift();
        const move = chess.move({from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4]});
        pieceMask.move(move);
        ground_move(move, chess);
        ground.set({fen: chess.fen(), check: false}); ground_set_moves();
        set_text(success_div, i18n.right_move);
    } else {
        set_text(success_div, i18n.solved);
        finish(true, true);
    }
    show_history(chess);
}
function handle_move(orig, dest) {
    if (finished || validating || pendingPromotion) return;
    clear_all_text();
    const promotions = chess.moves({verbose: true}).filter(move => move.from === orig && move.to === dest && move.promotion);
    if (promotions.length) {
        pendingPromotion = {orig, dest};
        ground.set({fen: chess.fen(), movable: {color: undefined, dests: new Map()}});
        picker.open({color: window.color, to: dest, orientation: ground.state.orientation});
    } else play_move(orig, dest);
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
    generation++; validating = false; alternatives.reset();
    finished = false; pendingPromotion = null;
    picker?.destroy();
    pieceMask?.destroy();
    clear_all_text();
    document.getElementById('next').classList.add('hidden');
    document.getElementById('history_container').classList.add('hidden');
    document.getElementById('pieceless_pieces').replaceChildren();
    document.querySelector('.pieceless-workspace').classList.remove('training-revealed');
    setup_chess(fen);
    const parser = new Chess(fen);
    const format = document.querySelector('.pieceless-workspace').dataset.solutionFormat;
    solution = sourceSolution.trim().split(/\s+/).filter(Boolean).map(token => {
        const move = format === 'san' ? parser.move(token) : parser.move({from: token.slice(0, 2), to: token.slice(2, 4), promotion: token[4]});
        if (!move) throw new Error('Invalid puzzle move');
        return move.from + move.to + (move.promotion || '');
    });
    setup_pieces(chess); setup_to_play(chess);
    window.color = chess.turn() === 'w' ? 'white' : 'black';
    window.ground?.destroy(); setup_ground(fen); ground_set_moves();
    ground.set({animation: {enabled: false}, check: false, movable: {showDests: visualization.destinations.checked}, draggable: {enabled: false}});
    const pieces = [...ground.state.pieces].sort(([a, pieceA], [b, pieceB]) =>
        (pieceA.role === 'king') - (pieceB.role === 'king') || a.localeCompare(b));
    const requested = visualization.target;
    const count = Math.min(requested, pieces.length);
    document.querySelector('.pieceless-workspace').classList.toggle('training-partial', count < pieces.length);
    pieceMask = createPieceMask(document.getElementById('chessground'), pieces.slice(0, count).map(([square]) => square));
    visualization.begin(fen + '|' + sourceSolution, requested, count);
    setup_move_handler(handle_move);
    setup_click_handler(square => {
        if (!finished && visualization.destinations.checked && ground_legal_moves(chess).has(square)) visualization.help();
    });
    picker = createPromotionPicker({element: document.querySelector('[data-promotion-picker]'),
        onChoose(promotion) { const move = pendingPromotion; pendingPromotion = null; if (move) play_move(move.orig, move.dest, promotion); },
        onCancel() { pendingPromotion = null; ground.set({fen: chess.fen()}); ground_set_moves(); }});
    resize_ground();
    document.getElementById('give-up').onclick = () => { if (!finished) finish(true); };
    document.getElementById('training_restart').onclick = main;
}

window.onresize = onresize;
window.addEventListener('pageshow', event => { if (event.persisted) main(); });
window.addEventListener('native-visualization-destinations', event => ground.set({movable: {showDests: event.detail.enabled}}));
main();
