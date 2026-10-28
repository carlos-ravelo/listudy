import { inspectMove, parseUciMove } from './modules/chess_moves.js';
require("regenerator-runtime/runtime"); // required for sleep (https://github.com/babel/babel/issues/9849#issuecomment-487040428)

const Chessground = require('chessground').Chessground;
const Chess = require('chess.js')

import { turn_color, setup_chess, san_to_uci, initial_fen } from './modules/chess_utils.js';
import { load_stockfish } from './modules/stockfish.js';
import { enginePosition } from './modules/engine_position.js';
let engineStartFen;
import { tree_move_index, tree_children, tree_possible_moves, has_children, 
         need_hint, update_value, date_sort, tree_get_node, tree_children_filter_sort } from './modules/tree_utils.js';
import { generate_move_trees } from './modules/tree_from_pgn.js';
import { sleep } from './modules/sleep.js';
import { unescape_string } from './modules/security_related.js';
import { ground_init_state, onresize, resize_ground, setup_ground, ground_set_moves,
         ground_undo_last_move, setup_move_handler, ground_move } from './modules/ground.js';
import { set_text, clear_all_text, success_div, info_div, error_div, suggestion_div } from './modules/info_boxes.js';

async function handle_move(orig, dest) {
    if (move(orig, dest)) ai_move();

}

function move(orig, dest, promotion = 'q') {
    const candidate = inspectMove(chess, {from: orig, to: dest, promotion});
    if (!candidate) return false;
    const m = chess.move(candidate.san);
    ground_set_moves();
    ground_move(m,chess);
    return true;
}

function animate_progress_bar(movetime, reason="") {
    document.getElementById("progress_reason").innerText = reason;
    let bar = document.getElementById("progress");
    bar.style.transitionDuration = `${movetime/1000}s`;
    bar.style.width = "100%";
    window.setTimeout(function() {
        let bar = document.getElementById("progress");
        bar.style.transitionDuration = "";
        bar.style.width = "0%";
        document.getElementById("progress_reason").innerText = "";
    }, movetime);
}

function ai_move() {
    let movetime = 1000
    animate_progress_bar(movetime, "Calculating Move...");
    const position = enginePosition(engineStartFen, chess);
    sf.postMessage(`position fen ${position.initialFen}${position.moves.length ? ' moves ' + position.moves.join(' ') : ''}`);
    sf.postMessage(`go movetime ${movetime}`);
}

function stockfish_listener(line) {
    if(line.startsWith("bestmove")) {
        const candidate = parseUciMove(line.trim().split(/\s+/)[1]);
        if (candidate) move(candidate.from, candidate.to, candidate.promotion);
    }
}

function setup_options() {
    document.getElementById("reset_white").addEventListener('click', function (event) {
        reset("white");
    });
    document.getElementById("reset_black").addEventListener('click', function (event) {
        reset("black");
    });
    document.getElementById("takeback").addEventListener('click', function (event) {
        takeback();
    });
}
function reset(c) {
    let fen = initial_fen(chess);
    setup_chess(fen);
    engineStartFen = chess.fen();
    window.sf?.postMessage('ucinewgame');
    color = c;
    setup_ground(fen); //uses global color for orientation
    ground_set_moves();
    setup_move_handler(handle_move);
    if (c == "black") {
        ai_move();
    }
}

function takeback() {
    if(chess.history().length < 2) {
        return;
    }
    chess.undo();
    chess.undo();
    ground_undo_last_move()
    ground_undo_last_move()
    ground_set_moves();
    setup_move_handler(handle_move);
}

function main(hash) {
    if (document.location.hash != "") {
        let regex = /%20/g
        hash = document.location.hash.split("#")[1].replace(regex, " ");
    }
    let hash_splits = hash.split(";")
    let fen = hash_splits[0];
    if (fen.endsWith("-")) {
        // Add 0 1 to fens like 
        // rnbqk2r/ppp1ppbp/3p1np1/8/3P4/3BPN2/PPP2PPP/RNBQK2R w KQkq -
        // Otherwise chess.js wont parse the fen correctly
        fen = `${fen} 0 1`;
    }
    let first_move = hash_splits[1] || "p";

    setup_chess(fen);
    engineStartFen = chess.fen();
    window.color = turn_color(chess);
    if (first_move == "sf") {
        // switch the board rotation for the player to be bottom
        color = color == "white" ? "black" : "white";
    }
    setup_ground(fen); //uses global color for orientation
    resize_ground();
    setup_move_handler(handle_move);
    ground_set_moves();

    animate_progress_bar(2000, "Loading Stockfish...");

    load_stockfish(stockfish_listener, function() {
        sf.postMessage('ucinewgame');
        if (first_move == "sf") {
            ai_move();
        }
    }).catch(() => set_text(error_div, 'Stockfish could not load. Reload the page to retry.'));
    setup_options();
}

window.onresize = onresize;
main("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1;p");
