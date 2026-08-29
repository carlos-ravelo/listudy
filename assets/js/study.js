require("regenerator-runtime/runtime"); // required for sleep (https://github.com/babel/babel/issues/9849#issuecomment-487040428)

const Chessground = require('chessground').Chessground;
const Chess = require('chess.js')
import { turn_color, non_turn_color, setup_chess, uci_to_san, cal_to_ucistr, move_to_ucistr } from './modules/chess_utils.js';
import { string_hash } from './modules/hash.js';
import { clear_local_storage, get_option_from_localstorage } from './modules/localstorage.js';
import { tree_value_add, tree_progress, tree_move_index, tree_children, tree_possible_moves, has_children, tree_value,
         need_hint, update_value, value_sort, tree_get_node, tree_children_filter_sort, tree_get_node_depth,
         tree_get_node_string, tree_size_weighted_random_move, tree_max_num_moves_deep } from './modules/tree_utils.js';
import { generate_move_trees, annotate_pgn } from './modules/tree_from_pgn.js';
import { sleep } from './modules/sleep.js';
import { getRandomIntFromRange } from './modules/random.js';
import { unescape_string } from './modules/security_related.js';
import { ground_init_state, onresize, resize_ground, setup_ground, ground_set_moves,
         ground_undo_last_move, setup_move_handler, setup_click_handler, ground_move,
         create_arrow_from_move, create_pgn_arrow, create_pgn_circle, create_playable_arrow, get_doubled_playable_move_objects } from './modules/ground.js';
import { TextOverlayId, TextOverlayManager } from './modules/overlays.js';
import { set_text, clear_all_text, success_div, info_div, error_div, suggestion_div } from './modules/info_boxes.js';
import { array_contains } from './modules/utils.js';
import { StorageAdapter } from './storageAdapter.js';


const mode_free = "free_mode";

const comments_div = "comments";

let combo_count = 0;

/* Suggestions seen during the current session */
let seen_suggestions = [];

// Option to control how quickly the ai plays each move
let move_delay_time_key = "move_delay_time";
let move_delay_time = get_option_from_localstorage(move_delay_time_key, i18n.instant, [i18n.instant, i18n.fast, i18n.medium, i18n.slow]);

// Option to control how and when arrows are displayed
let show_arrows_key = "show_arrows";
let show_arrows = get_option_from_localstorage(show_arrows_key, i18n.arrows_new2x, [i18n.arrows_new2x, i18n.arrows_new5x, i18n.arrows_always, i18n.arrows_hidden]);

// Option to control how and when arrows are displayed
let arrow_type_key = "arrow_type";
let arrow_type = get_option_from_localstorage(arrow_type_key, i18n.arrow_type_both, [i18n.arrow_type_playable, i18n.arrow_type_pgn, i18n.arrow_type_both]);

// When enabled the board waits a few seconds at the end of the line before resetting.
let board_review_key = "board_review";
let board_review = get_option_from_localstorage(board_review_key, i18n.review_fast, [i18n.review_fast, i18n.review_slow]);

// When enabled, will skip to the first branch point in the PGN tree. If the move list is flat then this has no effect.
let key_moves_mode_key = "key_moves_mode";
let key_moves_mode = get_option_from_localstorage(key_moves_mode_key, i18n.key_move_enabled, [i18n.key_move_enabled, i18n.key_move_disabled]);

//  When enabled the comments from the opposite side's responses are also shown.
let show_comments_key = "show_comments";
let show_comments = get_option_from_localstorage(show_comments_key, i18n.comments_when_arrows, [i18n.comments_when_arrows, i18n.comments_always_on, i18n.comments_hidden]);

// Option to control the maximum number of moves being played
const DEPTH_MAX = -1;  // This constant is used to avoid having to calculate the tree depth when max_depth is at the max depth.
let max_depth_key_base = "max_depth_" + study_id + "_";
let max_depth = DEPTH_MAX;

function combo_text() {
    return "" + combo_count + "x ";
}

function right_move_text() {
    return combo_text() + i18n.success_right_move;
}

function achievement_end_of_line() {
    let t = StorageAdapter.getItem("achievements_lines_learned") || 0;
    StorageAdapter.setItem("achievements_lines_learned", Number(t) + 1);
    if (typeof achievement_student_test != "undefined") {
        document.dispatchEvent(achievement_student_test);
    }
    if (typeof achievement_student2_test != "undefined") {
        document.dispatchEvent(achievement_student2_test);
    }

}

// "cxb8=Q" => "cxb8="
// "abc" => ""
function san_promotion_prefix(san) {
    return san.substring(0, san.indexOf("=") + 1);
}

// checks if the san would be a possible promotion
// expected result for
//  moves: Array [ "cxb8=N" ]
//  san:   cxb8=Q
// would be "cxb8=Q.
// Returns "" if the san is not a possible promotion
// Used in handle_move to allow for underpromotions
function possible_promotion(moves, san) {
    let target_prefix = san_promotion_prefix(san);

    // this move did not promote
    if (target_prefix == "") {
        return "";
    }
    for (let m of moves) {
        let prefix = san_promotion_prefix(m);
        if (prefix == "") {
            continue;
        }
        if (prefix == target_prefix) {
            return m;
        }
    }
    return "";
}

async function handle_move(orig, dest) {

    clear_all_text();

    overlay_manager.mark_current_overlays_seen();

    total_moves += 1;

    let san = uci_to_san(chess, orig, dest);

    let possible_moves = tree_possible_moves(curr_move).map(m => m.move);

    let possible_promotion_san = possible_promotion(possible_moves, san);
    // the move automatically promoted to a queen, above we checked if it was
    // also possible to underpromote, if so we returned that san instead
    if (possible_promotion_san != "") {
        san = possible_promotion_san;
    }

    if(possible_moves.indexOf(san) != -1) {
        // console.log('curr_move', orig, dest, JSON.stringify(curr_move));
        // the move is one of the possible moves in the current position
        update_value(curr_move, 1, san);
        play_move(san);
        combo_count += 1;
        set_text(success_div, right_move_text());
        let reply = ai_move(curr_move);
        let end_of_line = reply == undefined;
        if (!end_of_line && max_depth !== DEPTH_MAX) {
            let curr_node = tree_get_node(curr_move);
            let curr_depth = tree_get_node_depth(curr_node);
            if (key_moves_mode == i18n.key_move_disabled || window.first_variation === null) {
                end_of_line = curr_depth >= max_depth;
            } else {
                end_of_line = curr_node.move_index >= window.first_variation && curr_depth >= max_depth;
            }
            // console.log('CURR_DEPTH', end_of_line, curr_node.move, curr_node.move_index, curr_depth);
        }
        await sleep(get_move_delay()); // instant play by the ai feels weird
        if (end_of_line) {
            achievement_end_of_line();
            set_text(success_div, right_move_text() + "\n" + i18n.success_end_of_line);
            if (board_review == i18n.review_slow) {
                await sleep(3000);
            }
            start_training();
        } else {
            play_move(reply);
        }
    } else {
        // wrong move at the current position
        update_value(curr_move, 0); //retrain all the possible replies
        combo_count = 0; //reset the combo
        // it is important that chess is set to the right position before
        // calling ground_undo_last_move(); since it used chess.fen() to
        // reset the position to the previous position
        ground_undo_last_move();
        set_text(error_div, i18n.error_wrong_move);
    }
    store_trees();
    setup_move();
    update_progress();
}

/**
 * Returns the PGN shapes (circles and arrows) from a move in the PGN file.
 * @param  m  The move.
 * @param  keyword  'cal' for arrows, and 'csl' for circles.
 */
function get_pgn_shapes(m, keyword) {
    if (m.comments != undefined) {
        let commands = m.comments.filter(c => c.commands != undefined).flatMap(c => c.commands);
        return commands.filter(cmd => cmd.key == keyword).flatMap(cmd => cmd.values);
    } else {
        return [];
    }
}

/**
 * Returns true if arrows should be shown.
 */
function give_hints(once) {
    if (once || show_arrows == i18n.arrows_always) {
        return true;
    }

    let all_moves = tree_possible_moves(curr_move);
    let min = Math.min(...all_moves.map(m => m.value));
    if (show_arrows == i18n.arrows_new2x && min < 2 ||
        show_arrows == i18n.arrows_new5x && min < 5) {
        return true;
    }
    return false;
}

/**
 * Update the hints/arrows on the board, depending on the current setting of the variable show_arrows.
 *
 * Clean playable moves = moves that don't have a corresponding PGN arrow
 * Doubled playable moves = playable moves that DO have a corresponding PGN arrow
 * Clean PGN arrows =  PGN arrows that are not playable
 * Arrow hints = the overlays (speech bubbles) that help the user understand arrows the first time
 *
 * @param  once  Pass true to override any value of variable show_arrows and display hints temporarily.
 */
function display_arrows(once) {
    let shapes = [];
    let all_moves = tree_possible_moves(curr_move);
    let current_move = tree_get_node(curr_move);
    let min = Math.min(...all_moves.map(m => m.value));
    let max = Math.max(...all_moves.map(m => m.value));

    overlay_manager.clear_overlays();
    if (!give_hints(once)) {
        ground.setShapes([]);
        return;
    }

    if (arrow_type == i18n.arrow_type_playable) {
        shapes.push(...all_moves.map(m => create_playable_arrow(m, max, min)));

    } else if (arrow_type == i18n.arrow_type_pgn) {
        let all_pgn_circles = get_pgn_shapes(current_move, "csl");
        let all_pgn_arrows = get_pgn_shapes(current_move, "cal");

        shapes.push(...all_pgn_circles.map(a => create_pgn_circle(a)));
        shapes.push(...all_pgn_arrows.map(a => create_pgn_arrow(a)));

        overlay_manager.setup_arrow_overlays(all_moves, all_pgn_arrows, max, min, true);

    } else if (arrow_type = i18n.arrow_type_both) {
        let all_pgn_circles = get_pgn_shapes(current_move, "csl");
        shapes.push(...all_pgn_circles.map(a => create_pgn_circle(a)));

        // Need to distinguish between three types of arrows: clean playable, doubled playable, and clean pgn arrows.
        // More info in method doc.
        let all_pgn_arrows = get_pgn_shapes(current_move, "cal");
        let all_pgn_arrows_uci = all_pgn_arrows.map(cal => cal_to_ucistr(cal));
        let all_playable_moves_uci = all_moves.map(m => move_to_ucistr(m));
        let clean_playable_moves = all_moves.filter(m => !array_contains(all_pgn_arrows_uci, move_to_ucistr(m)));
        let doubled_playable_move_objects = get_doubled_playable_move_objects(all_moves, all_pgn_arrows);
        let clean_pgn_arrows = all_pgn_arrows.filter(cal => !array_contains(all_playable_moves_uci, cal_to_ucistr(cal)));

        shapes.push(...clean_playable_moves.map(m => create_playable_arrow(m, max, min, "blue")));
        shapes.push(...doubled_playable_move_objects.map(x => create_playable_arrow(x.move, max, min, x.color)));
        shapes.push(...clean_pgn_arrows.map(a => create_pgn_arrow(a)));

        overlay_manager.setup_arrow_overlays(all_moves, clean_pgn_arrows, max, min);
    }
    ground.setShapes(shapes);
}

function capitalize_first_letter(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

function create_comment(container_div, response_num, move) {
    var comment_div = document.createElement('div');
    comment_div.id = 'comment' + response_num;

    var bold_text_elem = document.createElement('div');
    bold_text_elem.id = comment_div.id + "_bold";
    bold_text_elem.className = "bold";

    var comment_text_elem = document.createElement('div');
    comment_text_elem.id = comment_div.id + "_text";
    comment_text_elem.className = "text";

    comment_div.appendChild(bold_text_elem);
    comment_div.appendChild(comment_text_elem);
    container_div.appendChild(comment_div);

    let response_color = capitalize_first_letter(turn_color(chess));
    let move_color = capitalize_first_letter(non_turn_color(chess));
    let ext_san = tree_get_node_string(move);
    let current_move = response_num == undefined;
    let before_start = current_move && move.move == undefined;
    let first_move = move.move_index == 0;
    let text = unescape_string(move.comments[0].text.trim());
    let bold_text = undefined;

    if (before_start) {
        bold_text = "";
    } else if (current_move) {
        bold_text = move_color + " " + ext_san + ":"
    } else {  // response move
        bold_text = response_color + " " + (!first_move ? i18n.response : "") + " " + ext_san + ":";
    }

    set_text(comment_div.id, text, { bold_text: bold_text });
}

function create_comment_list(container_id, current_move, response_moves) {
    let container_div = document.getElementById(container_id);
    container_div.innerHTML = '';

    if (current_move != undefined) {
        create_comment(container_div, undefined, current_move);
    }

    for (let [i, move] of response_moves.entries()) {
        create_comment(container_div, i, move, true);
    }
}

/*
 * Display comments, either only for the current move, or for the opposite side's responses as well
 * if that option is turned on.
 */
function display_comments(once) {
    let cm = tree_get_node(curr_move);
    let current_move = undefined;
    let response_moves = [];

    if (once || show_comments == i18n.comments_always_on ||
        show_comments == i18n.comments_when_arrows && give_hints(once)) {

        // Get current move if it has a comment
        if (cm.comments != undefined && cm.comments[0] != undefined && cm.comments[0].text != undefined) {
            current_move = cm;
        }
        // Get the reponse moves that has comments
        let children = tree_children(curr_move);
        if (children.length > 0) {
            for (let m of children) {
                if (m.comments != undefined && m.comments[0] != undefined && m.comments[0].text != undefined) {
                    response_moves.push(m);
                }
            }
        }
    }

    create_comment_list("comments", current_move, response_moves);
}

function change_play_stockfish() {
    let fen = chess.fen();
    let link = document.getElementById("play_stockfish");
    let base = link.href.split("#")[0];
    link.href = `${base}#${fen}`;
}

/**
 * Lichess.org has two ways of launching an analysis board. One is through a FEN and the other
 * is through a PGN and a color. The benefit of the PGN version is that it allows the user to
 * step back through the move line and evaluate the position at any of the played moves. If the
 * repertoire doesn't start on move 1, ie it has a FEN code as a starting positionin the PGN
 * file, then using the PGN url doesn't work. So to utilize the possibility of the GN url when
 * we can, we use that url when the repoertoire starts at move 1, or else the FEN url.
 */
function change_analysis_board() {
    let link = document.getElementById("analysis_board");
    // The PGN standard requires a SetUp header when there is another start position
    let starts_midgame = trees[chapter].headers.SetUp != undefined;
    if (starts_midgame) {
        let fen = chess.fen();
        link.href = `https://lichess.org/analysis/${fen}`;
    } else {
        let pgn = encodeURIComponent(chess.pgn());
        let color = turn_color(chess);
        link.href = `https://lichess.org/analysis/pgn/${pgn}?color=${color}`;
    }
}

function setup_move() {
    change_play_stockfish();
    change_analysis_board();
    ground_set_moves(); // the legal moves of the position
    display_arrows(false);  // must come after ground_set_moves(), because it needs the legal_moves
    show_suggestions();  // must come after display_arrows(), beacuse it needs the arrows
    display_comments(false);
}

/*
 * Returns the ai move that should be played for the access position
 */
function ai_move(access) {
    //console.log('Finding moves after ' + (tree_get_node(access).move_index > 0 ? tree_get_node_string(tree_get_node(access)) : 'starting position'));

    let candidates = tree_children_filter_sort(access, {filter: has_children});
    let m = tree_size_weighted_random_move(candidates);

    // change the last updated value of the node so if other moves exists they will be
    // picked next time instead
    if (m !== undefined) {
        update_value(access, 1, m);
    }
    return m;
}

/*
 * Plays a move in san notation
 * Update chess, ground, access
 */
function play_move(san) {
    let m = chess.move(san);
    ground_move(m);
    curr_move.push(tree_move_index(curr_move, san));
}

function start_training() {
    window.curr_move = [chapter];
    window.first_variation = trees[chapter].first_variation;
    // this fen is the normal chess starting position
    let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    if ("headers" in trees[chapter]) {
        fen = trees[chapter].headers.FEN || fen;
    }
    setup_chess(fen);
    ground_init_state(fen);
    if (key_moves_mode == i18n.key_move_enabled && window.first_variation !== null) {
        for (let ki = 0; ki < window.first_variation; ++ki) {
            // Moves that are not fully trained are not skipped
            if (tree_children(curr_move)[0].value != 5) { break; }
            // Multiple moves are played without delay, causes distorted sound
            // sound_enabled controls if sound is played in sound.js
            // the sounds are initiated by ground.move which is used by play_move
            let stored_sound = sound_enabled;
            sound_enabled = false;
            play_move(ai_move(curr_move));
            sound_enabled = stored_sound;
        }
    }
    if (color != turn_color(chess)) {
        play_move(ai_move(curr_move));
    }
    setup_move();

    /* TODO figure out how to remove this. This is a workaround to make sure arrows appear right from
    the start. Without this, setShapes() in display_arrows() appear to have no effect. It's only needed the
    first time hints are displayed, so this is a good location. The redraw scrolls the page to the top
    on mobile devices, and having the call in display_arrows() then forces a scroll to the top every time
    the user makes a move or changes the Arrows option. Hours have been spent on this bug. Could be a
    bug in chessground. */
    ground.redrawAll();

    window.mode = mode_free;
}

/*
 * Store the trees in window.trees into localStorage
 */
function store_trees() {
    let tree_key = study_id + "_tree";
    try {
        StorageAdapter.setItem(tree_key, JSON.stringify(trees));
    } catch(caught_error) {
        console.log("Ignored localstorage error: " + caught_error);
    }
}

// load the trees from the localStorage or generate if they dont exist
function setup_trees() {
    let trees = {};
    const pgnParser = require('pgn-parser'); 
    
    try {
        const parsedpgn = pgnParser.parse(pgn);
        annotate_pgn(parsedpgn);
        trees = generate_move_trees(parsedpgn);
    } catch(caught_error) {
        console.log(caught_error);
        if (caught_error.location) {
            let error_text = caught_error.name + " at line: " + caught_error.location.start.line +
                             ", character: " + caught_error.location.start.column + "; Unexpected: \"" +
                             caught_error.found + "\"";
            set_text(error_div, error_text);
        }
    }
    
    window.trees = trees;
}

/*
 * Returns the name of the event or a generic Chapter 1 if no event is present
 */
function tree_chapter_name(tree_index) {
    return trees[tree_index].headers.Event || i18n.translation_chapter + " " + (tree_index+1);
}

// generate the chapter selection below the game board
// the chapter value is the id for the tree to use
function setup_chapter_select() {
    let select_key = study_id + "_selected";
    let select_id = "chapter_select"
    let select = document.getElementById(select_id);
    let selected = parseInt(StorageAdapter.getItem(select_key) || 0);

    // --- Override local storage if URL parameter is present ---
    const urlParams = new URLSearchParams(window.location.search);
    const chapterFromUrl = urlParams.get('chapter');
    
    if (chapterFromUrl) {
        // Remove all spaces and convert to lowercase for maximum resilience
        let targetNorm = chapterFromUrl.toLowerCase().replace(/\s+/g, '');
        
        for (let i = 0; i < trees.length; ++i) {
            let nameNorm = tree_chapter_name(i).toLowerCase().replace(/\s+/g, '');
            
            // Check for partial match to handle cut-off URLs or encoding issues
            if (nameNorm.includes(targetNorm) || targetNorm.includes(nameNorm)) {
                selected = i;
                StorageAdapter.setItem(select_key, selected);
                break;
            }
        }
    }
    // -----------------------------------------------------------

    selected = Math.min(selected, trees.length - 1);  // prevent error if replacing with a pgn with fewer chapters
    window.chapter = selected;
    for (let i = 0; i < trees.length; ++i) {
        let option = document.createElement("option");
        option.value = i;
        let name = tree_chapter_name(i);
        option.innerText = name;
        if (i == selected) {
            option.selected = true;
        }
        select.appendChild(option);
    }

    select.onchange = function() {
        let v = document.getElementById(select_id).value;
        StorageAdapter.setItem(select_key, v);
        window.chapter = v;
        start_training();
        update_progress(); // update the progress bar shown
        set_options_values_for_max_depth();  // update the max depth for the new chapter
    };
}

/**
 * Check whether a suggestion has been seen before (ever, or just in this session).
 * @param  key  The suggestion key
 * @param  ever  true to check if it has ever been seen, and false for just this session.
 */
function has_seen_suggestion(key, ever) {
    if (ever) {
        let lsKey = study_id + "_suggestions_" + key;
        return StorageAdapter.getItem(lsKey) === "true";
    } else {
        return array_contains(seen_suggestions, key);
    }
}

/**
 * Marks a suggestion as seen, both in localstorage and the current session
 */
function mark_suggestion_seen(key) {
    let lsKey = study_id + "_suggestions_" + key;
    StorageAdapter.setItem(lsKey, true);

    if (!array_contains(seen_suggestions, key)) {
        seen_suggestions.push(key);
    }
}

function show_pgn_arrow_hints() {
    return overlay_manager.has_current_overlay(TextOverlayId.FIRST_PGN_ARROW);
}
function show_neglected_move_hints() {
    return overlay_manager.has_current_overlay(TextOverlayId.FIRST_NEGLECTED_MOVE);
}

/*
 * Show suggestions based on the move number
 */
function show_suggestions() {
    let suggestions = [
        {expr: function(){ return show_pgn_arrow_hints() },           text: i18n.suggestion_first_pgn_arrow, once: false, key: TextOverlayId.FIRST_PGN_ARROW},
        {expr: function(){ return show_neglected_move_hints() },      text: i18n.suggestion_first_neglected_move, once: false, key: TextOverlayId.FIRST_NEGLECTED_MOVE},
        {expr: function(){ return total_moves >= 15 },                text: i18n.suggestion_share, once: true, key: "share"},
        {expr: function(){ return total_moves >= 30 && logged_in },   text: i18n.suggestion_favorite, once: true, key: "favorite"},
        {expr: function(){ return total_moves >= 30 && !logged_in },  text: i18n.suggestion_account, once: false, key: "account"},
        {expr: function(){ return total_moves >= 50 && logged_in },   text: i18n.suggestion_comment, once: true, key: "comment"},
        {expr: function(){ return total_moves >= 100 },               text: i18n.suggestion_100moves, once: false, key: "100moves"},
        {expr: function(){ return total_moves >= 250 },               text: i18n.suggestion_250moves, once: false, key: "250moves"}
    ]
    for (let suggestion of suggestions) {
        let seen = has_seen_suggestion(suggestion.key, suggestion.once);

        if (suggestion.expr() && !seen) {
            set_text(suggestion_div, suggestion.text);
            mark_suggestion_seen(suggestion.key);
            break;  // only show one suggestion at a time
        }
    }
}

function setup_intro() {
    set_text(info_div, i18n.info_intro);

    let roots = trees.map(x => x.root[0]);
    let max = Math.max(...roots.map(x => tree_value(x, Math.max)));

    if (max == 0 && show_arrows != i18n.arrows_hidden) {
        set_text(suggestion_div, i18n.info_arrows);
    }
}

function turn_on_hints_for_current_move() {
    display_arrows(true);
    display_comments(true);
}

function toggle_arrows() {
    let span = document.getElementById("arrows_toggle");
    let curr = span.textContent;
    switch (curr) {
        case i18n.arrows_new2x:
            curr = i18n.arrows_new5x;
            break;
        case i18n.arrows_new5x:
            curr = i18n.arrows_always;
            break;
        case i18n.arrows_always:
            curr = i18n.arrows_hidden;
            break;
        case i18n.arrows_hidden:
        default:
            curr = i18n.arrows_new2x;
            break;
    }
    span.textContent = curr;
    show_arrows = curr;
    display_arrows(false);
    display_comments(false);
    StorageAdapter.setItem(show_arrows_key, curr);
}

function toggle_arrow_type() {
    let span = document.getElementById("arrow_type");
    let curr = span.textContent;
    switch (curr) {
        case i18n.arrow_type_playable:
            curr = i18n.arrow_type_pgn;
            break;
        case i18n.arrow_type_pgn:
            curr = i18n.arrow_type_both;
            break;
        case i18n.arrow_type_both:
        default:
            curr = i18n.arrow_type_playable;
            break;
    }
    span.textContent = curr;
    arrow_type = curr;
    display_arrows(false);
    display_comments(false);
    StorageAdapter.setItem(arrow_type_key, curr);
}

function toggle_key_move() {
    let link = document.getElementById("key_move");
    let curr = link.textContent;
    switch (curr) {
        case i18n.key_move_enabled:
            curr = i18n.key_move_disabled;
            link.setAttribute("data-icon", "%");
            break;
        case i18n.key_move_disabled:
        default:
            curr = i18n.key_move_enabled;
            link.setAttribute("data-icon", "$");
            break;
    }
    key_moves_mode = curr;
    link.textContent = curr;
    StorageAdapter.setItem(key_moves_mode_key, curr);
}

function toggle_review() {
    let link = document.getElementById("line_review");
    let curr = link.textContent;
    switch (curr) {
        case i18n.review_fast:
            curr = i18n.review_slow;
            break;
        case i18n.review_slow:
        default:
            curr = i18n.review_fast;
            break;
    }
    board_review = curr;
    link.textContent = curr;
    StorageAdapter.setItem(board_review_key, curr);
}

function toggle_move_delay() {
    let span = document.getElementById("move_delay_time");
    let curr = span.textContent;
    switch (curr) {
        case i18n.instant:
            curr = i18n.fast;
            break;
        case i18n.fast:
            curr = i18n.medium;
            break;
        case i18n.medium:
            curr = i18n.slow;
            break;
        case i18n.slow:
        default:
            curr = i18n.instant;
            break;
    }
    span.textContent = curr;
    move_delay_time = curr;
    StorageAdapter.setItem(move_delay_time_key, curr);
}


function get_move_delay() {
    let delay = 300;
    switch (move_delay_time) {
        case i18n.instant:
            delay = 300;
            break;
        case i18n.fast:
            delay = getRandomIntFromRange(500, 1500);
            break;
        case i18n.medium:
            delay = getRandomIntFromRange(1500, 3000);
            break;
        case i18n.slow:
            delay = getRandomIntFromRange(5000, 10000);
            break;
        default:
            console.log("Got non supported move delay: ", move_delay_time);
            delay = 300;
    }
    return delay;
}

function toggle_comments() {
    let link = document.getElementById("comments_toggle");
    let curr = link.textContent;
    switch (curr) {
        case i18n.comments_always_on:
            curr = i18n.comments_hidden;
            break;
        case i18n.comments_hidden:
            curr = i18n.comments_when_arrows;
            break;
        case i18n.comments_when_arrows:
        default:
            curr = i18n.comments_always_on;
            break;
        }
    link.textContent = curr;
    show_comments = curr;
    display_comments(false);
    StorageAdapter.setItem(show_comments_key, curr);
}

function get_repertoire_depth() {
    let starting_moves = trees[chapter].root;
    let for_white = color == "white";
    return tree_max_num_moves_deep(starting_moves, for_white);
}

/**
 * Update option label with a new max depth.
 */
 function update_max_depth_label(depth, tree_depth) {
    let max_depth_container = document.getElementById("max_depth_container");
    let max_depth_label = document.getElementById("max_depth_label");

    max_depth_label.innerText = depth;
    if (depth == tree_depth) {
        max_depth = DEPTH_MAX;
        max_depth_container.classList.remove("option-highlighted");
    } else {
        max_depth = depth;
        max_depth_container.classList.add("option-highlighted");
    }
}

/**
 * User clicked on the + or - next to the max depth range control.
 */
function inc_or_dec_max_depth(delta) {
    let max_depth_range = document.getElementById("max_depth_range");
    let tree_depth = get_repertoire_depth();
    let depth = parseInt(max_depth_range.value, 10) || tree_depth;

    depth += delta;
    // Make sure it's not lower than 1 or higher than the actual depth of the tree
    depth = delta > 0 ? Math.min(depth, tree_depth) : Math.max(depth, 1);
    max_depth_range.value = depth;

    update_max_depth_label(depth, tree_depth);

    StorageAdapter.setItem(max_depth_key_base + chapter, max_depth);
}

/**
 * User dragged the max depth range/slider control to a new value.
 */
function max_depth_changed() {
    let max_depth_range = document.getElementById("max_depth_range");
    let tree_depth = get_repertoire_depth();
    let depth = parseInt(max_depth_range.value, 10) || tree_depth;

    update_max_depth_label(depth, tree_depth);

    StorageAdapter.setItem(max_depth_key_base + chapter, max_depth);
}

function reset_line() {
    start_training();
}

/*
 * Updates the progress modal html
 */
async function update_progress() {
    let d = document.getElementById("study_progress");
    d.innerHTML = "";

    for (let tree_index in trees) {
        let chapter_name = tree_chapter_name(tree_index);
        let tree = trees[tree_index];
        let progress = tree_progress(trees[tree_index].root[0]);
        let percent = parseInt( (progress[0] / progress[1]) * 100);
        let name = document.createElement("b");
        name.innerText = `${chapter_name} (${percent}%)`;
        d.appendChild(name);
        d.innerHTML += `
        <div class="progress-bar">
            <span id="progress" class="progress-bar-fill" style="width: ${percent}%;"></span>
        </div>
        `
    }

    let cp = document.getElementById("chapter_progress");
    let chapter_index = parseInt(chapter);
    let progress = tree_progress(trees[chapter].root[0]);
    let percent = parseInt( (progress[0] / progress[1]) * 100);
    cp.innerHTML = `
    <div class="progress-bar" title="${percent}%">
        <span id="progress" class="progress-bar-fill" style="width: ${percent}%;"></span>
    </div>
    `
}

async function setup_progress_reset() {
    let reset = document.getElementById("study_progress_reset");
    reset.onclick = function() {
        if (window.confirm(i18n.confirm_reset_progress)) {
            for (let c of trees) {
                tree_value_add(c.root[0], -5);
            }
            store_trees();
            update_progress();
            display_arrows(false);
            display_comments(false);
        }
    }
}

/**
 * Initiate all option labels on the page.
 */
function set_options_values() {
    let move_delay = document.getElementById("move_delay_time");
    move_delay.innerText = move_delay_time;

    let arrows_toggle = document.getElementById("arrows_toggle");
    arrows_toggle.innerText = show_arrows;

    let arrow_type_toggle = document.getElementById("arrow_type");
    arrow_type_toggle.innerText = arrow_type;

    let line_review = document.getElementById("line_review");
    line_review.innerText = board_review;

    let key_move = document.getElementById("key_move");
    key_move.innerText = key_moves_mode;
    key_move.setAttribute("data-icon", key_moves_mode == i18n.key_move_enabled ? "$" : "%");

    let comments_toggle = document.getElementById("comments_toggle");
    comments_toggle.innerText = show_comments;

    set_options_values_for_max_depth();
}

function set_options_values_for_max_depth() {
    let max_depth_key = max_depth_key_base + chapter;
    max_depth = get_option_from_localstorage(max_depth_key, DEPTH_MAX, undefined, {validate: Number.isInteger, transform: parseInt});

    let tree_depth = get_repertoire_depth();
    let max_depth_range = document.getElementById("max_depth_range");
    let depth_as_num = max_depth == DEPTH_MAX ? tree_depth : max_depth;
    let depth = Math.min(tree_depth, depth_as_num);
    max_depth_range.max = tree_depth;
    max_depth_range.value = depth;
    max_depth_range.disabled = (tree_depth == 1);

    update_max_depth_label(depth, tree_depth);
}

async function handle_click() {
    // Clearing the overlays here emulates the behaviour of normal arrows in chessground,
    // which disappear when you click on the chess board.
    overlay_manager.clear_overlays();
}

function setup_configs() {
    var click_elems = document.getElementsByClassName("clicking_turns_on_hints");
    Array.from(click_elems).forEach((el) => { el.onclick = turn_on_hints_for_current_move; });

    document.getElementById("hints").onclick = turn_on_hints_for_current_move;
    document.getElementById("arrows_toggle").onclick = toggle_arrows;
    document.getElementById("arrow_type").onclick = toggle_arrow_type;
    document.getElementById("line_review").onclick = toggle_review;
    document.getElementById("move_delay").onclick = toggle_move_delay;
    document.getElementById("key_move").onclick = toggle_key_move;
    document.getElementById("comments_toggle").onclick = toggle_comments;
    document.getElementById("reset_line").onclick = reset_line;
    document.getElementById("max_depth_sub").onclick = () => inc_or_dec_max_depth(-1);
    document.getElementById("max_depth_add").onclick = () => inc_or_dec_max_depth(+1);
    document.getElementById("max_depth_range").onchange = max_depth_changed;
    document.getElementById("max_depth_range").oninput = max_depth_changed;
}

window.overlay_manager = new TextOverlayManager();

async function main() {
    // 1. If the user is authenticated, try to fetch cloud progress/settings
    if (typeof logged_in !== 'undefined' && logged_in) {
        try {
            const response = await fetch('/api/progress', {
                credentials: 'same-origin'
            });
            if (response.ok) {
                const cloudSettings = await response.json();
                // Hydrate localStorage with cloud data
                Object.entries(cloudSettings).forEach(([key, value]) => {
                    // Save directly to localStorage to prevent triggering a bounce POST request
                    // Skip massive tree objects to avoid QuotaExceededError
                    if (key.endsWith('_tree')) {
                        return;
                    }
                    localStorage.setItem(key, value); 
                });
                
                // Reload global variables that were initialized before this async call
                move_delay_time = get_option_from_localstorage(move_delay_time_key, i18n.instant, [i18n.instant, i18n.fast, i18n.medium, i18n.slow]);
                show_arrows = get_option_from_localstorage(show_arrows_key, i18n.arrows_new2x, [i18n.arrows_new2x, i18n.arrows_new5x, i18n.arrows_always, i18n.arrows_hidden]);
                arrow_type = get_option_from_localstorage(arrow_type_key, i18n.arrow_type_both, [i18n.arrow_type_playable, i18n.arrow_type_pgn, i18n.arrow_type_both]);
                board_review = get_option_from_localstorage(board_review_key, i18n.review_fast, [i18n.review_fast, i18n.review_slow]);
                key_moves_mode = get_option_from_localstorage(key_moves_mode_key, i18n.key_move_enabled, [i18n.key_move_enabled, i18n.key_move_disabled]);
                show_comments = get_option_from_localstorage(show_comments_key, i18n.comments_when_arrows, [i18n.comments_when_arrows, i18n.comments_always_on, i18n.comments_hidden]);
            }
        } catch (error) {
            console.log("Ignored cloud sync fetch error: ", error);
        }
    }

    setup_ground();
    setup_chess();
    setup_trees();
    setup_chapter_select();
    set_options_values();
    setup_move_handler(handle_move);
    setup_click_handler(handle_click);

    window.total_moves = 0;

    resize_ground();

    setup_intro();

    start_training();
    setup_configs();
    update_progress();
    setup_progress_reset();
}

window.onresize = onresize;
main();
function triggerRandomChapter() {
    let selectObj = document.getElementById("chapter_select");
    
    if (selectObj && selectObj.options.length > 1) {
        let totalOptions = selectObj.options.length;
        let currentIndex = selectObj.selectedIndex;
        
        let randomIndex = Math.floor(Math.random() * totalOptions);
        
        if (randomIndex === currentIndex) {
            randomIndex = (randomIndex + 1) % totalOptions;
        }
        
        selectObj.selectedIndex = randomIndex;
        
        selectObj.dispatchEvent(new Event("change", { bubbles: true }));
    }
}

// 1. Auto-ejecutar al cargar la página (con 800ms de gracia)
document.addEventListener("DOMContentLoaded", function() {
    setTimeout(triggerRandomChapter, 800);
});

// 2. Ejecutar cada vez que presiones el botón de HTML
document.addEventListener("click", function(e) {
    let target = e.target.closest('#btn_random_chapter');
    if (target) {
        e.preventDefault();
        triggerRandomChapter();
    }
});
// ----------------------------------------

document.addEventListener("DOMContentLoaded", function() {
    let copyBtn = document.getElementById("copy_line_to_clipboard");
    
    if (copyBtn) {
        copyBtn.onclick = function(e) {
            e.preventDefault(); 
            
            // Cortamos el PGN exactamente donde termina cada partida
            let pgnGames = pgn.trim().split(/(?<=\*|1-0|0-1|1\/2-1\/2)\s+(?=\[)/);
            let currentChapterPgn = pgnGames[chapter];

            if (currentChapterPgn) {
                navigator.clipboard.writeText(currentChapterPgn).then(() => {
                    // Guardamos el texto original (probablemente traducido por Elixir)
                    let originalText = copyBtn.innerText;
                    
                    // Cambiamos el texto para dar feedback visual
                    copyBtn.innerText = "PGN copied to clipboard!";
                    
                    // Lo regresamos a la normalidad después de 2.5 segundos
                    setTimeout(() => {
                        copyBtn.innerText = originalText;
                    }, 2500);

                }).catch(err => {
                    console.error("Clipboard copy failed:", err);
                });
            } else {
                console.error("Could not extract current chapter PGN.");
            }
        };
    }
});

document.addEventListener("DOMContentLoaded", function() {
    const selectObj = document.getElementById("chapter_select");
    const prevBtn = document.getElementById("prev_chapter_btn");
    const nextBtn = document.getElementById("next_chapter_btn");
    const titleBtn = document.getElementById("current_chapter_title");
    const customList = document.getElementById("custom_chapter_list");

    function buildCustomList() {
        customList.innerHTML = "";

        // --- Create search field ---
        let searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Search chapter...";
        searchInput.style.width = "100%";
        searchInput.style.padding = "8px 12px";
        searchInput.style.boxSizing = "border-box";
        searchInput.style.border = "none";
        searchInput.style.borderBottom = "1px solid #ccc";
        searchInput.style.outline = "none";
        
        // Keep the search bar visible at all times
        searchInput.style.position = "sticky";
        searchInput.style.top = "0";
        searchInput.style.backgroundColor = "#fff"; 
        searchInput.style.zIndex = "10";
        // Evitar que el clic en el input cierre el menú
        searchInput.onclick = (e) => e.stopPropagation();
        customList.appendChild(searchInput);

        let items = []; // we save the references for filtering

        Array.from(selectObj.options).forEach((opt, index) => {
            let item = document.createElement("div");
            item.innerText = opt.text;
            item.style.padding = "8px 12px";
            item.style.cursor = "pointer";
            item.style.borderBottom = "1px solid #eee";
            item.style.textAlign = "left";
            
            // Highlight the active chapter
            if (index === selectObj.selectedIndex) {
                item.style.fontWeight = "bold";
                item.style.backgroundColor = "#e2e8f0";
            }

            // Hover effects
            item.onmouseover = () => item.style.backgroundColor = "#cbd5e1";
            item.onmouseout = () => {
                item.style.backgroundColor = (index === selectObj.selectedIndex) ? "#e2e8f0" : "transparent";
            };

            // Handle selection
            item.onclick = () => {
                selectObj.selectedIndex = index;
                selectObj.dispatchEvent(new Event("change", { bubbles: true }));
                customList.style.display = "none";
            };
            
            items.push(item);
            customList.appendChild(item);
        });

        // --- Filtering logic ---
        searchInput.addEventListener("input", function(e) {
            let filter = e.target.value.toLowerCase();
            items.forEach(item => {
                if (item.innerText.toLowerCase().includes(filter)) {
                    item.style.display = "block";
                } else {
                    item.style.display = "none";
                }
            });
        });

        // Optional: Auto-focus the search bar when opening the list
        setTimeout(() => searchInput.focus(), 50);
    }
    function updateChapterDisplay() {
        if (selectObj && selectObj.options.length > 0) {
            titleBtn.innerText = selectObj.options[selectObj.selectedIndex].text;
            buildCustomList(); 
        }
    }

    if (selectObj && prevBtn && nextBtn && titleBtn && customList) {
        
        // Watch the select element for dynamic option injection by Listudy
        const observer = new MutationObserver(function() {
            if (selectObj.options.length > 0) {
                updateChapterDisplay();
                observer.disconnect(); // Stop watching once loaded
            }
        });
        observer.observe(selectObj, { childList: true });

        // Fallback in case options are already there
        if (selectObj.options.length > 0) {
            updateChapterDisplay();
        }
        
        selectObj.addEventListener("change", updateChapterDisplay);

        // Toggle custom dropdown
        titleBtn.onclick = function(e) {
            e.preventDefault();
            customList.style.display = customList.style.display === "none" ? "block" : "none";
            
            // Scroll to the active chapter in the list when opened
            if (customList.style.display === "block") {
                const activeItem = customList.children[selectObj.selectedIndex];
                if (activeItem) {
                    activeItem.scrollIntoView({ block: "nearest" });
                }
            }
        };

        // Close dropdown if clicking outside
        document.addEventListener("click", function(e) {
            if (!titleBtn.contains(e.target) && !customList.contains(e.target)) {
                customList.style.display = "none";
            }
        });

        // Previous button logic
        prevBtn.onclick = function(e) {
            e.preventDefault();
            if (selectObj.selectedIndex > 0) {
                selectObj.selectedIndex--;
                selectObj.dispatchEvent(new Event("change"));
            }
        };

        // Next button logic
        nextBtn.onclick = function(e) {
            e.preventDefault();
            if (selectObj.selectedIndex < selectObj.options.length - 1) {
                selectObj.selectedIndex++;
                selectObj.dispatchEvent(new Event("change"));
            }
        };
    }
});

// --- Custom Navigation Controls ---

window.go_back = async function() {
    for (let i = 0; i < 2; i++) {
        if (curr_move.length > 1) {
            curr_move.pop(); 
            chess.undo();    
            if (typeof ground_undo_last_move === "function") ground_undo_last_move(); 
            await sleep(200);
        }
    }
    if (typeof display_arrows === "function") display_arrows();
    if (typeof display_comments === "function") display_comments(false);
};

window.go_forward = async function() {
    for (let i = 0; i < 2; i++) {
        let possible_moves = tree_possible_moves(curr_move);
        
        if (possible_moves && possible_moves.length > 0) {
            let next_node = possible_moves[0];
            let next_san = typeof next_node === "string" ? next_node : next_node.move;            
            if (next_san) {
                play_move(next_san);
                await sleep(200);
            }
        } else {
            break;
        }
    }
    if (typeof display_arrows === "function") display_arrows();
    if (typeof display_comments === "function") display_comments(false);
};

// Bind to keyboard arrows
document.addEventListener("keydown", function(event) {
    if (event.key === "ArrowLeft") {
        event.preventDefault();
        go_back();
    } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go_forward();
    }
});


document.addEventListener("DOMContentLoaded", function() {
    const addBtn = document.getElementById("add_to_collection");
    const manageBtn = document.getElementById("manage_collection");
    const chapterSelect = document.getElementById("chapter_select");

    // --- UX: Clean and adjust the title ---
    const h1Title = document.querySelector('h1.clicking_turns_on_hints');
    if (h1Title) {
        h1Title.innerText = h1Title.innerText.replace(/_/g, ' ');
        h1Title.style.fontSize = '1.8rem';
        h1Title.style.marginBottom = '10px';
    }

    // Inject the Modal into the DOM
    const modalHTML = `
    <div id="collection_modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; align-items:center; justify-content:center;">
        <div style="background:#fff; color:#333; width:90%; max-width:600px; max-height:85vh; border-radius:8px; display:flex; flex-direction:column; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
            
            <!-- Fixed header with collection selector and actions -->
            <div style="padding:20px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <h2 style="margin:0; font-size:1.2em;">Collection:</h2>
                    <select id="collection_selector" style="padding:5px 8px; border-radius:4px; border:1px solid #ccc; font-size:0.9em; background:#fff; margin:0; outline:none;"></select>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <button id="btn_rename_collection" style="background:transparent; border:none; box-shadow:none; margin:0; padding:5px; font-size:1.1em; cursor:pointer;" title="Rename Active Collection">✏️</button>
                    <button id="btn_delete_collection" style="background:transparent; border:none; box-shadow:none; margin:0; padding:5px; font-size:1.1em; cursor:pointer;" title="Delete Active Collection">🗑️</button>
                    <button id="btn_new_collection" style="background:transparent; border:none; box-shadow:none; margin:0; padding:5px; font-size:1.1em; cursor:pointer;" title="Create New Collection">➕</button>
                </div>
            </div>
            <!-- Scrollable list -->
            <div style="padding:10px 20px; overflow-y:auto; flex-grow:1;">
                <ul id="collection_list" style="list-style:none; padding:0; margin:0;"></ul>
            </div>
            
            <!-- Fixed footer buttons -->
            <div style="padding:15px 20px; border-top:1px solid #eee; display:flex; gap:10px; justify-content:flex-end; background:#fafafa; border-bottom-left-radius:8px; border-bottom-right-radius:8px;">
                <button id="modal_download" class="button">Download PGN</button>
                <button id="modal_clear" class="button" style="background:#d9534f; color:#fff; border:none;">Clear Current</button>
                <button id="modal_close" class="button" style="background:#ccc; color:#333; border:none;">Close</button>
            </div>
            
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById("collection_modal");
    const listEl = document.getElementById("collection_list");
    const selectorEl = document.getElementById("collection_selector");
    const newBtn = document.getElementById("btn_new_collection");
    const renameBtn = document.getElementById("btn_rename_collection");
    const deleteBtn = document.getElementById("btn_delete_collection");

    // Utilities to fetch current UI context
    function getFallbackChapterTitle(pgnStr) {
        let match = pgnStr.match(/\[Event\s+"([^"]+)"\]/i);
        if (match && match[1] && match[1] !== "?") return match[1];
        match = pgnStr.match(/\[White\s+"([^"]+)"\]/i);
        return match ? match[1] : "Unnamed Chapter";
    }

    function getCurrentChapterTitle() {
        if (chapterSelect && chapterSelect.options.length > 0 && typeof chapter !== 'undefined') {
            return chapterSelect.options[chapter].text.trim();
        }
        return "Unnamed Chapter";
    }

    function getCurrentStudyTitle() {
        let h1 = document.querySelector('h1.clicking_turns_on_hints');
        if (h1) return h1.innerText.trim();
        return document.title.split('-')[0].trim() || "Unknown Study";
    }

    function getCurrentChapterPgn() {
        if (typeof pgn === 'undefined' || typeof chapter === 'undefined') return null;
        let pgnGames = pgn.trim().split(/(?<=\*|1-0|0-1|1\/2-1\/2)\s+(?=\[)/);
        let current = pgnGames[chapter];
        return current ? current.trim() : null;
    }

    // --- Core Data Management ---
    function getCollectionsData() {
        let data = JSON.parse(localStorage.getItem('listudy_collections'));
        
        // Auto-migration: Move old data to the new structure
        if (!data) {
            let oldCart = JSON.parse(localStorage.getItem('listudy_cart') || '[]');
            data = {
                active: "Default",
                collections: {
                    "Default": oldCart
                }
            };
            localStorage.removeItem('listudy_cart');
            saveCollectionsData(data);
        }
        return data;
    }

    function saveCollectionsData(data) {
        localStorage.setItem('listudy_collections', JSON.stringify(data));
    }

    function getActiveCart() {
        let data = getCollectionsData();
        if (!data.collections[data.active]) {
            data.collections[data.active] = [];
        }
        
        // Migrate old string elements if they exist
        let migrated = false;
        let cart = data.collections[data.active].map(item => {
            if (typeof item === 'string') {
                migrated = true;
                return { 
                    pgn: item, 
                    study: "Unknown Study", 
                    title: getFallbackChapterTitle(item),
                    studyPath: window.location.pathname.split('?')[0]
                };
            }
            return item;
        });
        
        if (migrated) {
            data.collections[data.active] = cart;
            saveCollectionsData(data);
        }
        return cart;
    }

    // --- UI Rendering ---
    function renderSelector() {
        let data = getCollectionsData();
        selectorEl.innerHTML = "";
        Object.keys(data.collections).forEach(colName => {
            let option = document.createElement("option");
            option.value = colName;
            option.textContent = colName;
            if (colName === data.active) option.selected = true;
            selectorEl.appendChild(option);
        });
    }

    
    // We add an optional parameter to track which item just moved
    function renderModalList(highlightIndex = -1) {
        let data = getCollectionsData();
        let cart = data.collections[data.active];
        
        // Inject a tiny animation just for the highlighted row
        listEl.innerHTML = `
            <style>
                @keyframes flashSuccess {
                    0% { background-color: #d4edda; }
                    100% { background-color: transparent; }
                }
                .highlight-row { animation: flashSuccess 0.8s ease-out; }
            </style>
        `;
        
        if (cart.length === 0) {
            listEl.innerHTML += "<li style='padding:10px 0;'>This collection is empty.</li>";
            return;
        }

        let hasOtherCollections = Object.keys(data.collections).length > 1;
        let moveOptionsHtml = `<option value="" disabled selected>📦 Move</option>`;
        if (hasOtherCollections) {
            Object.keys(data.collections).forEach(col => {
                if (col !== data.active) {
                    moveOptionsHtml += `<option value="${col}">${col}</option>`;
                }
            });
        }

        let lastStudy = null;

        cart.forEach((item, index) => {
            let studyName = item.study || "Unknown Study";
            
            if (studyName !== lastStudy) {
                let studyHeader = document.createElement("li");
                studyHeader.innerHTML = `<strong style="display:block; padding: 15px 0 5px 0; border-bottom: 2px solid #ddd; margin-bottom: 5px; color: #0056b3; font-size: 0.9em;">📘 ${studyName}</strong>`;
                listEl.appendChild(studyHeader);
                lastStudy = studyName; 
            }

            let li = document.createElement("li");
            li.style = "display:flex; justify-content:space-between; align-items:center; padding:5px 0 5px 15px; border-bottom:1px solid #f5f5f5;";
            
            // Add the highlight class if this is the row that just moved
            if (index === highlightIndex) {
                li.className = "highlight-row";
            }
            
            let safePath = item.studyPath || window.location.pathname.split('?')[0];
            let chapterUrl = `${safePath}?chapter=${encodeURIComponent(item.title)}`;
            
            let isFirst = index === 0;
            let isLast = index === cart.length - 1;
            
            let moveSelectHtml = hasOtherCollections 
                ? `<select data-index="${index}" class="move_chapter" style="background:transparent; border:1px solid #ddd; border-radius:4px; font-size:0.8em; cursor:pointer; margin-right:8px; padding:2px; max-width:80px;" title="Move to another collection">${moveOptionsHtml}</select>`
                : '';

            // Shorten the study name slightly so it doesn't break the layout
            let shortStudyName = studyName.length > 25 ? studyName.substring(0, 25) + "..." : studyName;

            // Added the small study name right next to the chapter title
            li.innerHTML = `
                <span style="padding-right:10px; flex-grow:1; line-height:1.4; word-break:break-word;">
                    • <a href="${chapterUrl}" style="color:#007BFF; text-decoration:none;" target="_blank" title="Go to chapter">${item.title}</a>
                    <span style="font-size:0.75em; color:#888; margin-left:6px;" title="${studyName}">(${shortStudyName})</span>
                </span>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                    ${moveSelectHtml}
                    <button data-index="${index}" class="move_up" style="background:transparent; border:none; cursor:pointer; opacity: ${isFirst ? '0.2' : '1'}; padding:2px;" ${isFirst ? 'disabled' : ''} title="Move Up">⬆️</button>
                    <button data-index="${index}" class="move_down" style="background:transparent; border:none; cursor:pointer; opacity: ${isLast ? '0.2' : '1'}; padding:2px;" ${isLast ? 'disabled' : ''} title="Move Down">⬇️</button>
                    <button data-index="${index}" class="remove_chapter" style="background:transparent; border:none; color:#dc3545; cursor:pointer; font-weight:bold; margin-left:8px; padding:2px;" title="Remove chapter">✕</button>
                </div>
            `;
            listEl.appendChild(li);
        });

        // Event Listener: Move Up
        document.querySelectorAll(".move_up").forEach(btn => {
            btn.onclick = function() {
                let idx = parseInt(this.getAttribute("data-index"), 10);
                let currentData = getCollectionsData();
                let currentCart = currentData.collections[currentData.active];
                if (idx > 0) {
                    [currentCart[idx - 1], currentCart[idx]] = [currentCart[idx], currentCart[idx - 1]];
                    saveCollectionsData(currentData);
                    // Re-render and highlight the new position
                    renderModalList(idx - 1);
                }
            };
        });

        // Event Listener: Move Down
        document.querySelectorAll(".move_down").forEach(btn => {
            btn.onclick = function() {
                let idx = parseInt(this.getAttribute("data-index"), 10);
                let currentData = getCollectionsData();
                let currentCart = currentData.collections[currentData.active];
                if (idx < currentCart.length - 1) {
                    [currentCart[idx + 1], currentCart[idx]] = [currentCart[idx], currentCart[idx + 1]];
                    saveCollectionsData(currentData);
                    // Re-render and highlight the new position
                    renderModalList(idx + 1);
                }
            };
        });

        // Event Listener: Move to another collection
        document.querySelectorAll(".move_chapter").forEach(select => {
            select.onchange = function() {
                let idx = parseInt(this.getAttribute("data-index"), 10);
                let targetCol = this.value;
                let currentData = getCollectionsData();
                
                if (targetCol && currentData.collections[targetCol]) {
                    let itemToMove = currentData.collections[currentData.active].splice(idx, 1)[0];
                    currentData.collections[targetCol].push(itemToMove);
                    
                    saveCollectionsData(currentData);
                    renderModalList();
                    updateCartUI();
                }
            };
        });

        // Event Listener: Delete
        document.querySelectorAll(".remove_chapter").forEach(btn => {
            btn.onclick = function() {
                let idx = parseInt(this.getAttribute("data-index"), 10);
                let currentData = getCollectionsData();
                currentData.collections[currentData.active].splice(idx, 1);
                saveCollectionsData(currentData);
                renderModalList();
                updateCartUI();
            };
        });
    }
    
    function updateCartUI() {
        if (!addBtn) return;
        let cart = getActiveCart();
        let data = getCollectionsData();
        let currentPgn = getCurrentChapterPgn();
        
        let isAlreadyAdded = currentPgn && cart.some(item => item.pgn === currentPgn);

        // Truncate the name if it's too long so the button doesn't break
        let displayName = data.active.length > 12 ? data.active.substring(0, 12) + "..." : data.active;

        if (isAlreadyAdded) {
            addBtn.innerHTML = `Already in [${displayName}] (<span id="collection_count">${cart.length}</span>)`;
            addBtn.style.opacity = "0.5";
            addBtn.style.cursor = "default";
        } else {
            addBtn.innerHTML = `➕ Add to [${displayName}] (${cart.length})`;
            addBtn.style.opacity = "1";
            addBtn.style.cursor = "pointer";
        }
        
        // Show "Manage" if ANY collection has at least 1 item
        let hasItemsAnywhere = Object.values(data.collections).some(arr => arr.length > 0);
        let hasMultipleCollections = Object.keys(data.collections).length > 1;
        if (manageBtn) {
            manageBtn.style.display = (hasItemsAnywhere || hasMultipleCollections) ? 'inline-block' : 'none';
        }    }

    // --- Main Actions & Listeners ---
    if (addBtn) {
        updateCartUI();

        addBtn.onclick = function(e) {
            e.preventDefault();
            let cleanPgn = getCurrentChapterPgn();
            if (cleanPgn) {
                let data = getCollectionsData();
                let cart = data.collections[data.active];
                
                if (cart.some(item => item.pgn === cleanPgn)) return; 

                cart.push({
                    pgn: cleanPgn,
                    study: getCurrentStudyTitle(),
                    title: getCurrentChapterTitle(),
                    studyPath: window.location.pathname.split('?')[0]
                });
                
                saveCollectionsData(data);
                updateCartUI();
            }
        };

        if (manageBtn) {
            manageBtn.onclick = function(e) {
                e.preventDefault();
                renderSelector();
                renderModalList();
                modal.style.display = 'flex';
            };
        }

        // Change active collection
        selectorEl.addEventListener('change', function(e) {
            let data = getCollectionsData();
            data.active = e.target.value;
            saveCollectionsData(data);
            renderModalList();
            updateCartUI();
        });

        // Create new collection
        newBtn.onclick = function() {
            let name = prompt("Enter a name for the new collection:");
            if (name && name.trim() !== "") {
                let data = getCollectionsData();
                let cleanName = name.trim();
                
                if (!data.collections[cleanName]) {
                    data.collections[cleanName] = [];
                }
                data.active = cleanName;
                
                saveCollectionsData(data);
                renderSelector();
                renderModalList();
                updateCartUI();
            }
        };
// Rename collection
        renameBtn.onclick = function() {
            let data = getCollectionsData();
            let currentName = data.active;
            let newName = prompt(`Rename collection "${currentName}" to:`, currentName);
            
            if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
                let cleanName = newName.trim();
                
                if (data.collections[cleanName]) {
                    alert("A collection with this name already exists.");
                    return;
                }
                
                // Move the array to the new key and delete the old key
                data.collections[cleanName] = data.collections[currentName];
                delete data.collections[currentName];
                data.active = cleanName;
                
                saveCollectionsData(data);
                renderSelector();
                renderModalList();
                updateCartUI();
            }
        };

        // Delete collection
        deleteBtn.onclick = function() {
            let data = getCollectionsData();
            let currentName = data.active;
            
            // Prevent deleting the very last collection
            if (Object.keys(data.collections).length === 1) {
                alert("You cannot delete your only collection. You can 'Clear' its contents instead.");
                return;
            }

            if (confirm(`Are you sure you want to completely delete the collection "${currentName}"?`)) {
                delete data.collections[currentName];
                
                // Automatically switch to the first available collection
                data.active = Object.keys(data.collections)[0];
                
                saveCollectionsData(data);
                renderSelector();
                renderModalList();
                updateCartUI();
            }
        };

        // Modal close controls
        document.getElementById("modal_close").onclick = () => modal.style.display = 'none';
        
        window.addEventListener('click', function(event) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        // Clear active collection
        document.getElementById("modal_clear").onclick = () => {
            let data = getCollectionsData();
            if(confirm(`Are you sure you want to clear all chapters in "${data.active}"?`)) {
                data.collections[data.active] = [];
                saveCollectionsData(data);
                renderModalList();
                updateCartUI();
            }
        };

        // Download active collection PGN
        document.getElementById("modal_download").onclick = () => {
            let cart = getActiveCart();
            if (cart.length === 0) return;
            let data = getCollectionsData();
            
            let combinedPgn = cart.map(item => item.pgn).join('\n\n\n');
            let blob = new Blob([combinedPgn], { type: "text/plain" });
            let link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            
            // Format filename using the active collection name
            let safeName = data.active.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.download = `${safeName}.pgn`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        if (chapterSelect) {
            chapterSelect.addEventListener('change', () => setTimeout(updateCartUI, 150));
        }
    }
});