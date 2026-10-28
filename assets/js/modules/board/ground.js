const Chessground = require('chessground').Chessground;
import { ground_legal_moves, cal_to_ftc, san_to_uci, move_to_ucistr } from './chess_utils';
import { array_contains } from '../utils.js';

/*
 * All the functions assume there is a global variable
 * ground that contains the chessground
 */

function ground_init_state(fen, custom_orientation = null) {
    const config = {};
    config["orientation"] = custom_orientation || color;
    config["movable"] = { free: false, showDests: true };
    // fen for the initial position
    config["fen"] = fen;
    config["highlight"] = { check: true };
    config["lastMove"] = undefined;
    config["drawable"] = {brushes: {
        normal: {key: "n", color: "#3333ff", opacity: 0.6, lineWidth: 10 },
        transparent: {key: "t", color: "#3333ff", opacity: 0.3, lineWidth: 10 },
        // 
        pgn_green:  {key: "pgn_green",  color: "hsl(120, 100%, 27%)", opacity: 0.35, lineWidth: 10 },
        pgn_blue:   {key: "pgn_blue",   color: "hsl(216, 100%, 35%)", opacity: 0.35, lineWidth: 10 },
        pgn_red:    {key: "pgn_red",    color: "hsl(0, 100%, 55%)",   opacity: 0.35, lineWidth: 10 },
        pgn_yellow: {key: "pgn_yellow", color: "hsl(48, 100%, 45%)",  opacity: 0.40, lineWidth: 10 },
        // 
        playable_pgn_normal_green:  {key: "playable_normal_green",  color: "hsl(120, 100%, 20%)", opacity: 0.9,  lineWidth: 9 },
        playable_pgn_normal_blue:   {key: "playable_normal_blue",   color: "hsl(216, 100%, 45%)", opacity: 0.9,  lineWidth: 9 },
        playable_pgn_normal_red:    {key: "playable_normal_red",    color: "hsl(0, 100%, 60%)",   opacity: 0.9,  lineWidth: 9 },
        playable_pgn_normal_yellow: {key: "playable_normal_yellow", color: "hsl(48, 100%, 45%)",  opacity: 0.9, lineWidth: 9 },
        // 
        playable_pgn_transparent_green:  {key: "playable_transparent_green",  color: "hsl(120, 100%, 30%)", opacity: 0.9,  lineWidth: 9 },
        playable_pgn_transparent_blue:   {key: "playable_transparent_blue",   color: "hsl(216, 100%, 55%)", opacity: 0.9,  lineWidth: 9 },
        playable_pgn_transparent_red:    {key: "playable_transparent_red",    color: "hsl(0, 100%, 60%)",   opacity: 0.9,  lineWidth: 9 },
        playable_pgn_transparent_yellow: {key: "playable_transparent_yellow", color: "hsl(48, 100%, 55%)",  opacity: 0.9, lineWidth: 9 }
    }};
    ground.set(config);
}

function setup_move_handler(f) {
    ground.set({movable: {events: {after: f}}});
}

function setup_click_handler(f) {
    ground.set({events: {select: f}});
}

// setsup the basic ground
function setup_ground(fen) {
    const config = {};
    window.ground = Chessground(document.getElementById("chessground"), config);
    window.window_width = window.innerWidth;
    ground_init_state(fen);
}

/*
 * Window resize callback
 */
function onresize() {
    const study = document.getElementById("study_layout");
    if (window.innerWidth === window.window_width && (!study || window.innerHeight === window.window_height)) {
        return;
    }

    window.window_width = window.innerWidth;
    window.window_height = window.innerHeight;
    resize_ground();
    window.overlay_manager?.on_resize();
}

/*
 * Returns the width the chessground should have as integer
 */
function calculate_width() {
    let gc = document.getElementById("game_container");
    const frame = gc.querySelector(".study-board-frame");
    if (frame && gc.closest(".study-workspace") && window.innerWidth > 600) {
        const actions = document.getElementById("study_board_actions");
        const board = document.getElementById("chessground");
        const gap = actions && board
            ? Math.max(0, actions.getBoundingClientRect().top - board.getBoundingClientRect().bottom)
            : 0;
        const controlsHeight = actions ? actions.offsetHeight + gap : 0;
        return Math.min(gc.clientWidth, Math.max(240, Math.floor(window.innerHeight - frame.getBoundingClientRect().top - controlsHeight - 16)));
    }
    let gc_width = (frame || gc).offsetWidth;
    let width = gc_width ;//- 7; // for the numbers on the side of the ground
    //width -= width % 8; // fix chrome alignment errors; https://github.com/ornicar/lila/pull/3881
    // shouldn't be neccessary any longer https://github.com/lichess-org/chessground/pull/191
    return width;
}

// call on window resizing
function resize_ground() {
    let width_integer = calculate_width();
    const studyContainer = document.getElementById("game_container");
    if (studyContainer.closest(".study-workspace")) {
        studyContainer.style.setProperty("--study-board-size", window.innerWidth > 600 ? width_integer + "px" : "100%");
        // Account for controls that wrap after the board column becomes narrower.
        width_integer = calculate_width();
        studyContainer.style.setProperty("--study-board-size", window.innerWidth > 600 ? width_integer + "px" : "100%");
    }
    let width = "" + width_integer + "px";
    let chessground = document.getElementById("chessground");
    chessground.style.width = width;
    chessground.style.height = width;
    ground.redrawAll();
}

function create_arrow_from_move(move, brush) {
    let ft = san_to_uci(chess, move);
    return {orig: ft.from, dest: ft.to, brush: brush};
}

/**
 * Create a playable arrow.
 *
 * @param  m  The move to create an arrow for.
 * @param  max  The number of times the most played candidate move has been played.
 * @param  min  The number of times the least played candidate move has been played.
 * @param  pgn_color  The color of the arrow to be created, or undefined for classic playable only arrows.
 */
function create_playable_arrow(m, max, min, pgn_color = undefined) {
    let move = m.move;
    let some_neglected = some_moves_neglected(max, min);
    let current_neglected = current_move_neglected(m, max);
    let brush = undefined;
    if(pgn_color) {  // pgn arrows
        let brush_prefix = some_neglected ? (current_neglected ? "playable_pgn_normal_" : "playable_pgn_transparent_") : "playable_pgn_normal_";
        brush = brush_prefix + pgn_color;
    } else {  // auto arrows
        brush = some_neglected ? (current_neglected ? "normal" : "transparent") : "normal";
    }
    return create_arrow_from_move(move, brush);
}

/**
 * Combines all playable moves and all PGN arrows from the PGN file and returns the intersection of
 * those two sets, ie all PGN arrows that are also playable moves. A special object containing information
 * from both the move and the PGN arrow is returned. This is used to create arrows with the correct
 * visual appearence when hints are turned on.
 */
function get_doubled_playable_move_objects(all_moves, all_pgn_arrows) {
    let all_pgn_arrow_uci = [];
    let color_by_pgn_arrow_uci = {};
    for (let cal of all_pgn_arrows) {
        let ftc = cal_to_ftc(cal);
        let ucistr = ftc.from + ftc.to;

        color_by_pgn_arrow_uci[ucistr] = ftc.color;
        all_pgn_arrow_uci.push(ucistr);
    }

    // Merge the playable moves and the pgn arrows
    let union = all_moves.map(move => {
        let uci = move_to_ucistr(move);
        let color = color_by_pgn_arrow_uci[uci];
        return {
            color: color,
            uci: uci,
            move: move
        };
    })
    // And filter so that only those moves that are both playable a pgn arrow are left
    return union.filter(x => array_contains(all_pgn_arrow_uci, x.uci))
}

/**
 * Create an arrow that represents a pure PGN arrow, that is not playable, but only exists as an arrow
 * in the PGN file.
 * @param  cal  The cal value (ie "Gd2d4" for a Green d2 -> d4 arrow).
 */
function create_pgn_arrow(cal) {
    let ftc = cal_to_ftc(cal)
    let brush = "pgn_" + ftc.color;
    return {orig: ftc.from, dest: ftc.to, brush: brush};
}

/**
 * Creates a circle from the PGN.
 * @param  csl  The csl value from the PGN file (ie Bd2 for a Blue circle on d2).
 */
function create_pgn_circle(csl) {
    let ftc = cal_to_ftc(csl)
    let brush = "pgn_" + ftc.color;
    return {orig: ftc.from, brush: brush};
}

function some_moves_neglected(max, min) {
    return min < (0.5 * max);
}

function current_move_neglected(move, max) {
    return move.value < (0.5 * max)
}

// sets the legal moves that can be played in the current chess instance
function ground_set_moves() {
    let moves = ground_legal_moves(chess);
    ground.set({movable: {dests: moves}});
}

/*
 * Same as ground_set_moves but takes an instance of chess instead of the global one
 */
function ground_set_moves_from_instance(c) {
    let moves = ground_legal_moves(c);
    ground.set({movable: {dests: moves}});
}

/**
 * Checks whether a move is legal (after they have been set in chessground).
 */
function ground_is_legal_move(from, to) {
    let legal_moves = ground.state.movable.dests;
    if (legal_moves == undefined) {
        return true;
    }
    let dests = legal_moves.get(from) || [];
    let legal = array_contains(dests, to);
    return legal;
}

export { ground_init_state, onresize, calculate_width, resize_ground, setup_ground, ground_set_moves, ground_set_moves_from_instance, setup_move_handler, setup_click_handler, ground_is_legal_move, create_arrow_from_move, create_pgn_arrow, create_pgn_circle, some_moves_neglected, current_move_neglected, create_playable_arrow, get_doubled_playable_move_objects };
