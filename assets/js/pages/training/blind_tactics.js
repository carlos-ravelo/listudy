import { createTrainingLifecycle } from '../../modules/training_lifecycle.js';
import { createLineExercise } from '../../modules/line_exercise.js';
import { moveToUci, playUciMove } from '../../modules/chess_moves.js';
import { blockBoardMoves, restoreBoardPosition } from '../../modules/board_interaction.js';
require("regenerator-runtime/runtime"); // required for sleep (https://github.com/babel/babel/issues/9849#issuecomment-487040428)

const Chessground = require('chessground').Chessground;
const Chess = require('chess.js')
import { resize_ground, onresize, setup_ground, ground_set_moves_from_instance,
         setup_click_handler } from '../../modules/ground.js';
import { ground_legal_moves, turn_color, setup_chess, uci_to_san, san_to_uci } from '../../modules/chess_utils.js';
import { set_text, clear_all_text, success_div, info_div, error_div, suggestion_div } from '../../modules/info_boxes.js';
import { sleep } from '../../modules/sleep.js';
import { createTacticAttempts } from '../../modules/tactic_attempts.js';
const exercise = createLineExercise({ getPosition: () => current_chess,
    applyMove: uci => playUciMove(current_chess, uci), validator: createTacticAttempts() });
import { setupNativeVisualization } from '../../modules/native_visualization.js';

let finished = false;
let loadedKey;
const visualization = setupNativeVisualization('blind');
const lifecycle = createTrainingLifecycle({ restore: () => main(true) });
lifecycle.page.use(visualization);
let requestedHidden = 0;
const originalInstruction = document.querySelector('.training-instruction').textContent;

function show_div(id) {
    document.getElementById(id).classList.remove("hidden");
}

function get_current_chess() {
    let tc = (typeof current_chess == 'undefined') ? new Chess(window.initial_fen) : current_chess;
    let moves_played = tc.history().length
    let history = chess.history();
    for (let i = moves_played; i < Math.min(current_move, history.length); ++i) {
        let m = history[i];
        tc.move(m);
    }
    return tc;
}

function highlight_moves(square) {
    highlighted_squares = legal_moves.get(square);
    window.clicked_piece = square;

    if (highlighted_squares == undefined) {
        highlighted_squares = [];
        ground.setShapes([]);
        return;
    }

    let shapes = [];
    if (!visualization.destinations.checked) { ground.setShapes([]); return; }
    visualization.help();
    for (let s of highlighted_squares) {
        shapes.push({orig: s, brush: "green"});
    }
    ground.setShapes(shapes);
    ground.redrawAll(); 
}

function set_div_text(id, text) {
    clear_all_text();
    set_text(id, text);
}

function reveal_solution(help = true) {
    if (finished) return;
    exercise.stop();
    visualization.tracker.end(!help, help);
    finished = true;
    document.getElementById("next").classList.remove("hidden");
    current_move = chess.history().length;
    current_chess = get_current_chess();
    restoreBoardPosition(ground, current_chess, { playable: false });
    ground.setShapes([]);
    setup_move_text();
}


async function handle_click(square) {
    if (finished || exercise.pending) return;
    ground.selectSquare(null);
    if ((legal_moves.get(clicked_piece) || []).includes(square)) {
        const expected = chess.history({verbose: true})[current_move];
        if (!expected) return;
        const ticket = exercise.revision;
        const prefix = current_chess.history({verbose: true}).map(moveToUci);
        const promotion = expected.from === clicked_piece && expected.to === square ? expected.promotion : 'q';
        const result = await exercise.play({from: clicked_piece, to: square, promotion}, {
            onChecking() { set_div_text(info_div, i18n.checking); },
            onPlayerMove() { visualization.tracker.decision(true); }
        });
        if (!result || !exercise.isCurrent(ticket)) return;
        if (result.status !== 'accepted') {
            if (result.status === 'rejected') visualization.tracker.decision(false);
            set_div_text(result.status === 'unknown' ? info_div : error_div, result.status === 'unknown' ? i18n.unconfirmed : i18n.wrong_move);
            window.clicked_piece = null; ground.setShapes([]);
            return;
        }
        if (result.continuation) {
            const replacement = new Chess(window.initial_fen);
            for (const uci of [...prefix, ...result.continuation]) playUciMove(replacement, uci);
            window.chess = replacement;
        }
        highlighted_squares = [];
        window.clicked_piece = null;
        current_move += result.reply ? 2 : 1;
        if (result.complete) {
            if (!visualization.tracker.current.assisted && !visualization.tracker.current.errors) {
                let total = localStorage.getItem("achievements_blind_tactics_solved");
                localStorage.setItem("achievements_blind_tactics_solved", Number(total) + 1);
            }
            set_div_text(success_div, i18n.success);
            reveal_solution(false);
        } else set_div_text(info_div, i18n.right_move + result.reply.san);
        legal_moves = ground_legal_moves(current_chess);
    } else {
        if (legal_moves.has(clicked_piece) && square !== clicked_piece && !legal_moves.has(square)) {
            visualization.tracker.decision(false);
            set_div_text(error_div, i18n.wrong_move);
        }
        highlight_moves(square);
    }
    setup_move_text();
}

/*
 * Dirty hack? Load the required values from a hidden form field.
 * The values of the hidden form field is changed by the push_redirect
 * First this was done inside of a script but the script would not get
 * re-evaluated by the browser resulting in old values being used.
 */
function load_data() {
    pgn = document.getElementById("pgn").value;
    color = document.getElementById("color").value;

    const chess = new Chess();
    window.chess = chess;
    chess.load_pgn(pgn);
    const initial = new Chess();
    initial.load_pgn(pgn);
    while (initial.undo()) {}
    window.initial_fen = initial.fen();

    // we cant hide more moves than there were. If chess.history().length is smaller
    // then the position starts with the starting position
    ply = Math.min(document.getElementById("ply").value, chess.history().length);
}

function ply_change() {
    let p = document.getElementById("ply_select").value;
    const value = Math.max(0, Math.min(20, Math.floor(Number(p) || 0)));
    document.getElementById("ply_select").value = value;
    try { localStorage.setItem("blind_tactics_hidden", value); } catch (_) {}
    visualization.difficulty.value = 'manual';
    visualization.tracker.configure('difficulty', 'manual');
}

function setup_ply() {
    let stored;
    try { stored = localStorage.getItem("blind_tactics_hidden"); } catch (_) {}
    const value = visualization.difficulty.value === 'auto' ? visualization.tracker.level : stored == null ? 4 : Number(stored);
    const p = Number.isFinite(value) ? Math.max(0, Math.min(20, Math.floor(value))) : 4;
    window.hidden_moves = p;
    requestedHidden = p;
    document.getElementById("ply_select").value = p;
    document.getElementById("ply_select").onchange = ply_change;
}

// the moves that were played from the base position to the current ply
function played_from_base() {
    return chess.history().slice(ply - hidden_moves,current_move);
}

// generates the fen of the position that is initially shown on the board
function generate_base_fen() {
    let tc = new Chess(window.initial_fen);
    for (let m of chess.history().slice(0, ply - hidden_moves)) {
        tc.move(m);
    }
    base_fen = tc.fen();
}

// generates the pgn of the moves that were played from the base position
function setup_move_text() {
    let moves = played_from_base();
    let tc = new Chess(base_fen);

    for (let m of moves) {
        tc.move(m);
    }

    let pgn = tc.pgn();
    pgn = pgn.split("\n");
    pgn = pgn[pgn.length-1];

    document.getElementById("moves").innerText = pgn;
    document.getElementById('blind_move_sequence').hidden = !moves.length;
    document.querySelector('.training-instruction').textContent = hidden_moves === 0 ? i18n.direct : originalInstruction;
}

function setup_give_up(scope) {
    let e = document.getElementById("give-up");
    scope.assign(e, 'onclick', () => reveal_solution(true));
}

function setup_flip_board(scope) {
    let e = document.getElementById("toggle-orientation");
    scope.assign(e, 'onclick', ground.toggleOrientation);
}


function main(force = false) {
    if (!lifecycle.page.active) return;
    const input = document.getElementById('pgn');
    if (!input) { lifecycle.reset(); return; }
    const key = document.getElementById('puzzle_key').value;
    if (force !== true && key === loadedKey && window.ground?.state.dom.elements.board.isConnected) {
        setup_move_text();
        if (finished) show_div('next');
        return;
    }
    loadedKey = key;
    const scope = lifecycle.reset();
    scope.use(() => exercise.stop());
    exercise.reset();
    finished = false;
    clear_all_text();
    document.getElementById('next').classList.add('hidden');
    setup_ply();
    // generates the window.chess object
    load_data();
    window.hidden_moves = Math.min(hidden_moves, Number(ply));
    visualization.begin(String(key).split('-')[0], requestedHidden, hidden_moves);

    window.base_fen = undefined; 
    generate_base_fen();
    setup_ground(base_fen);
    scope.use(ground);
    ground.set({animation: {enabled: false}});
    blockBoardMoves(ground);
    window.current_move = Number(ply);
    // get_current_chess() assumes that current_chess is undefined on first load
    // since the page can get reloaded by live_view the current_chess could still be
    // defined from the previous puzzles, causing errors
    window.current_chess = undefined; 
    window.current_chess = get_current_chess();
    exercise.reset({ initialFen: window.initial_fen,
        moves: chess.history({verbose: true}).slice(current_move).map(moveToUci) });
    window.legal_moves = ground_legal_moves(current_chess);

    setup_move_text(); // display the hidden moves in text form

    window.highlighted_squares = [];
    window.clicked_piece = null;

    setup_click_handler(scope.guard(handle_click));

    // fixes a bug of pieces getting stuck in the left corner of the board after
    // clicking on continue
    // https://www.reddit.com/r/chess/comments/in00we/introducing_blind_tactics/g44lpcz
    resize_ground();
    scope.timeout(ground.redrawAll, 10);
    scope.timeout(ground.redrawAll, 100);
    setup_give_up(scope);
    setup_flip_board(scope);
    const help = document.querySelector('[data-training-help]');
    if (help) { scope.assign(help, 'ontoggle', () => { if (help.open) visualization.help(); }); if (help.open) visualization.help(); }
    scope.assign(document.getElementById('training_restart'), 'onclick', () => main(true));
}

lifecycle.page.listen(document, "phx:update", main);
lifecycle.page.listen(window, 'native-visualization-destinations', () => {
    ground.setShapes([]);
    window.clicked_piece = null;
    window.highlighted_squares = [];
});
lifecycle.page.assign(window, 'onresize', onresize);
window.old_pgn = "abc";
main();
