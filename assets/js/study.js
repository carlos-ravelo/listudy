require("regenerator-runtime/runtime"); // required for sleep (https://github.com/babel/babel/issues/9849#issuecomment-487040428)

const Chessground = require('chessground').Chessground;
const Chess = require('chess.js')
import { turn_color, non_turn_color, setup_chess, uci_to_san, cal_to_ucistr, move_to_ucistr } from './modules/chess_utils.js';
import { string_hash } from './modules/hash.js';
import { clear_local_storage, get_option_from_localstorage } from './modules/localstorage.js';
import { tree_value_add, tree_move_index, tree_children, tree_possible_moves, has_children, tree_value,
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
import { splitChapterPgn, chapterFromUrl } from './modules/study/chapter_pgn.js';
import { setupStudyCollections } from './modules/study_collections.js';
import { setupStudyNavigation, setupStudyMoveNavigation, setupPuzzleRun } from './modules/study_page_controls.js';
import { readChapterStats, recordChapterAttempt, chapterMoveCatalog, chapterCoverage, chapterMastery, chapterWeakness, weakChapterOrder, beginChapterPractice, finishChapterPractice, recentPracticePerformance, chapterProgressState } from './modules/study/chapter_stats.js';
import { emptyChapterReviews, readChapterReviews, chapterReviewSignature, recordLineReview, chapterReviewStatus, dueChapterOrder } from './modules/study/chapter_review.js';
import { setupStudyMoveTree, readChapterPosition } from './modules/study/study_move_tree.js';
import Alpine from 'alpinejs';

window.Alpine = Alpine;
Alpine.start();


let studyFeatureViews = [];
let studyMoveNavigation = { update() {} };
let studyMoveTree = { update() {} };
let readMode = false;
let chapterStats = { version: 1, chapters: {} };
let practiceChapter = null;
let chapterMoveCatalogs = [];
let chapterReviewSignatures = [];
let chapterReviews = emptyChapterReviews();
let spacedReviewRunActive = false;
let spacedReviewQueue = [];
let lineReviewRecorded = false;
let lineEligibleForReview = true;
let trainingSessionId = 0;
let reviewRefreshTimer;
const studyColor = color;
let weakChapterRunActive = false;
let weakChapterQueue = [];

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
    if (readMode) {
        let san = uci_to_san(chess, orig, dest);
        const moves = tree_children(curr_move).map(node => node.move);
        san = possible_promotion(moves, san) || san;
        if (!play_read_move(san)) {
            setup_move();
            set_text(info_div, i18n.read_choose_continuation);
        }
        return;
    }
    const sessionId = trainingSessionId;

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

    const wasCorrect = possible_moves.indexOf(san) != -1;
    const positionId = curr_move.slice(1).map((_, depth) => tree_get_node(curr_move.slice(0, depth + 2)).move).join('|');
    const moveId = wasCorrect
        ? (positionId ? positionId + '|' : '') + san
        : null;
    record_chapter_attempt(wasCorrect, moveId, positionId);
    if (!wasCorrect && !lineReviewRecorded && lineEligibleForReview) record_line_review(false);

    if(wasCorrect) {
        // console.log('curr_move', orig, dest, JSON.stringify(curr_move));
        // the move is one of the possible moves in the current position
        update_value(curr_move, 1, san);
        play_move(san);
        combo_count += 1;
        set_text(success_div, right_move_text());
        let reply = ai_move(curr_move);
        const naturalEnd = reply == undefined;
        let end_of_line = naturalEnd;
        if (!end_of_line && !spacedReviewRunActive && max_depth !== DEPTH_MAX) {
            let curr_node = tree_get_node(curr_move);
            let curr_depth = tree_get_node_depth(curr_node);
            if (key_moves_mode == i18n.key_move_disabled || window.first_variation === null) {
                end_of_line = curr_depth >= max_depth;
            } else {
                end_of_line = curr_node.move_index >= window.first_variation && curr_depth >= max_depth;
            }
            // console.log('CURR_DEPTH', end_of_line, curr_node.move, curr_node.move_index, curr_depth);
        }
        store_trees();
        await sleep(get_move_delay()); // instant play by the ai feels weird
        if (sessionId !== trainingSessionId) return;
        if (end_of_line) {
            finish_chapter_practice(naturalEnd && lineEligibleForReview);
            if (naturalEnd && !lineReviewRecorded && lineEligibleForReview) record_line_review(true);
            achievement_end_of_line();
            set_text(success_div, right_move_text() + "\n" + i18n.success_end_of_line);

            // Auto-advance to the specific chapter type if Puzzle Run is active
            const currentRunMode = localStorage.getItem("puzzleRunMode");

            if (spacedReviewRunActive) {
                setTimeout(() => {
                    if (sessionId === trainingSessionId) selectNextDueChapter();
                }, 500);
            } else if (weakChapterRunActive) {
                setTimeout(() => {
                    if (sessionId === trainingSessionId) selectNextWeakChapter();
                }, 500);
            } else if (currentRunMode === "next" || currentRunMode === "random") {
                setTimeout(() => {
                    if (sessionId !== trainingSessionId) return;
                    const targetBtnId = currentRunMode === "next" ? "next_chapter_btn" : "btn_random_chapter";
                    const autoBtn = document.getElementById(targetBtnId);
                    if (autoBtn) autoBtn.click();
                }, 500);
            } else {
                if (board_review == i18n.review_slow) {
                    await sleep(3000);
                }
                if (sessionId !== trainingSessionId) return;
                start_training();
            }
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

function updateWeakChapterRunUi() {
    const status = document.getElementById("weak_run_status");
    status.hidden = !weakChapterRunActive && !spacedReviewRunActive;
    status.textContent = spacedReviewRunActive
        ? i18n.spaced_review_active + " · " + (spacedReviewQueue.length + 1) + " " + i18n.weak_run_remaining
        : weakChapterRunActive
            ? i18n.weak_run_active + " · " + (weakChapterQueue.length + 1) + " " + i18n.weak_run_remaining
            : "";
    window.dispatchEvent(new CustomEvent("study-weak-run-updated", {
        detail: { active: weakChapterRunActive }
    }));
    window.dispatchEvent(new CustomEvent("study-spaced-run-updated", {
        detail: { active: spacedReviewRunActive }
    }));
}

function stopWeakChapterRun() {
    weakChapterRunActive = false;
    weakChapterQueue = [];
    updateWeakChapterRunUi();
}

function selectNextWeakChapter() {
    if (!weakChapterRunActive) return;
    const next = weakChapterQueue.shift();
    if (next === undefined) {
        stopWeakChapterRun();
        set_text(success_div, i18n.weak_run_complete);
        return;
    }
    const select = document.getElementById("chapter_select");
    select.value = String(next);
    select.dispatchEvent(new CustomEvent("change", {
        bubbles: true,
        detail: { weakRun: true }
    }));
    updateWeakChapterRunUi();
}

function toggleWeakChapterRun() {
    if (weakChapterRunActive) {
        stopWeakChapterRun();
        return;
    }
    weakChapterQueue = weakChapterOrder(chapterStats, trees.length, chapterMoveCatalogs);
    if (weakChapterQueue.length === 0) return;
    set_read_mode(false);
    if (spacedReviewRunActive) stopSpacedReviewRun();
    weakChapterRunActive = true;
    window.dispatchEvent(new Event("study-puzzle-run-off"));
    document.getElementById("progress_modal").style.display = "none";
    selectNextWeakChapter();
}

function stopSpacedReviewRun() {
    spacedReviewRunActive = false;
    spacedReviewQueue = [];
    updateWeakChapterRunUi();
}

function selectNextDueChapter() {
    if (!spacedReviewRunActive) return;
    const next = spacedReviewQueue.shift();
    if (next === undefined) {
        stopSpacedReviewRun();
        set_text(success_div, i18n.spaced_review_complete);
        return;
    }
    const select = document.getElementById("chapter_select");
    select.value = String(next);
    select.dispatchEvent(new CustomEvent("change", {
        bubbles: true,
        detail: { spacedRun: true }
    }));
    updateWeakChapterRunUi();
}

function toggleSpacedReviewRun() {
    if (spacedReviewRunActive) {
        stopSpacedReviewRun();
        return;
    }
    spacedReviewQueue = dueChapterOrder(chapterReviews, chapterReviewSignatures);
    if (spacedReviewQueue.length === 0) return;
    set_read_mode(false);
    if (weakChapterRunActive) stopWeakChapterRun();
    spacedReviewRunActive = true;
    window.dispatchEvent(new Event("study-puzzle-run-off"));
    document.getElementById("progress_modal").style.display = "none";
    selectNextDueChapter();
}

function chapter_stats_key() {
    return study_id + "_chapter_stats";
}

function chapter_reviews_key() {
    return study_id + "_chapter_reviews";
}

function record_line_review(wasClean) {
    recordLineReview(chapterReviews, chapter, chapterReviewSignatures[chapter], wasClean);
    StorageAdapter.setItem(chapter_reviews_key(), JSON.stringify(chapterReviews));
    lineReviewRecorded = true;
}

function record_chapter_attempt(wasCorrect, moveId, positionId) {
    recordChapterAttempt(chapterStats, chapter, wasCorrect, moveId, positionId);
    StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
}

function finish_chapter_practice(completed) {
    if (practiceChapter === null) return;
    finishChapterPractice(chapterStats, practiceChapter, completed);
    practiceChapter = null;
    StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
    update_progress();
}

function chapter_performance_text(index, recent = recentPracticePerformance(chapterStats, index, chapterReviewSignatures[index])) {
    const accuracy = i18n.progress_recent_accuracy + ': ' + (recent.accuracy === null ? '—' : recent.accuracy + '%') +
        (recent.count ? ' (' + recent.count + ' ' + (recent.count === 1 ? i18n.progress_practice : i18n.progress_practices) + ')' : '');
    const practice = recent.active || recent.last;
    if (!practice) return accuracy;
    return accuracy + ' · ' + chapter_practice_text(recent);
}

function chapter_practice_text(recent, compact = false) {
    const practice = recent.active || recent.last;
    if (!practice) return i18n.progress_no_recent_practice;
    const label = compact
        ? (recent.active ? i18n.progress_current_short : i18n.progress_last_short)
        : (recent.active ? i18n.progress_current_practice : i18n.progress_last_practice);
    return label + ': ' + practice.missedMoves + '/' + practice.testedMoves + ' ' + i18n.progress_moves_missed +
        (!recent.active && !practice.completed ? ' (' + i18n.progress_incomplete + ')' : '');
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

    if (readMode || once || show_comments == i18n.comments_always_on ||
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
    const lastMove = chess.history({ verbose: true }).slice(-1)[0];
    ground.set({
        fen: chess.fen(),
        turnColor: turn_color(chess),
        check: chess.in_check(),
        lastMove: lastMove ? [lastMove.from, lastMove.to] : undefined
    });
    change_play_stockfish();
    change_analysis_board();
    ground_set_moves(); // the legal moves of the position
    if (readMode) {
        ground.setShapes([]);
    } else {
        display_arrows(false);  // must come after ground_set_moves(), because it needs the legal_moves
        show_suggestions();  // must come after display_arrows(), beacuse it needs the arrows
    }
    display_comments(false);
    studyMoveNavigation.update();
    update_read_mode_ui();
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
    change_play_stockfish();
    change_analysis_board();
    studyMoveNavigation.update();
}

function start_training() {
    finish_chapter_practice(false);
    trainingSessionId += 1;
    lineReviewRecorded = false;
    lineEligibleForReview = !readMode;
    window.curr_move = [chapter];
    window.first_variation = trees[chapter].first_variation;
    // this fen is the normal chess starting position
    let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    if ("headers" in trees[chapter]) {
        fen = trees[chapter].headers.FEN || fen;
    }
    setup_chess(fen);
       
    // Extract only board state, turn, castling, and en passant (ignoring move counters)
    const base_fen = fen.split(" ").slice(0, 4).join(" ");
    const start_base_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
    
    // Sync color dynamically for custom positions (e.g., tactical puzzles)
    if (base_fen !== start_base_fen) {
        color = turn_color(chess);
    }
    
    // Pass the active color to auto-rotate the board
    ground_init_state(fen, color);
    if (!readMode && !spacedReviewRunActive && key_moves_mode == i18n.key_move_enabled && window.first_variation !== null) {
        for (let ki = 0; ki < window.first_variation; ++ki) {
            // Moves that are not fully trained are not skipped
            if (tree_children(curr_move)[0].value != 5) { break; }
            // Multiple moves are played without delay, causes distorted sound
            // sound_enabled controls if sound is played in sound.js
            // the sounds are initiated by ground.move which is used by play_move
            let stored_sound = sound_enabled;
            sound_enabled = false;
            play_move(ai_move(curr_move));
            lineEligibleForReview = false;
            sound_enabled = stored_sound;
        }
    }
    if (!readMode && color != turn_color(chess)) {
        play_move(ai_move(curr_move));
    }
    if (!readMode) {
        beginChapterPractice(chapterStats, chapter, chapterReviewSignatures[chapter]);
        practiceChapter = chapter;
        StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
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
    studyMoveNavigation.update();
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
    chapterReviewSignatures = trees.map(tree => chapterReviewSignature(tree.root, tree.headers.FEN));
    const standardFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
    chapterMoveCatalogs = trees.map(tree => {
        const fen = tree.headers.FEN || standardFen;
        const customPosition = fen.split(" ").slice(0, 4).join(" ") !== standardFen;
        return chapterMoveCatalog(tree.root, customPosition || studyColor === "white");
    });
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
    document.getElementById("study_progress").addEventListener("study-progress-open-chapter", event => {
        const index = event.detail.index;
        if (!Number.isInteger(index) || index < 0 || index >= trees.length) return;
        select.value = String(index);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        document.getElementById("progress_modal").style.display = "none";
    });
    document.getElementById("progress_modal").addEventListener("study-progress-toggle-weak-run", toggleWeakChapterRun);
    document.getElementById("progress_modal").addEventListener("study-progress-toggle-spaced-run", toggleSpacedReviewRun);
    window.addEventListener("study-puzzle-run-changed", stopWeakChapterRun);
    window.addEventListener("study-puzzle-run-changed", stopSpacedReviewRun);
    let selected = parseInt(StorageAdapter.getItem(select_key) || 0);

    const linkedChapter = chapterFromUrl(window.location.search, trees.map((_, index) => tree_chapter_name(index)));
    if (linkedChapter !== null) selected = linkedChapter;
    if (!Number.isInteger(selected) || selected < 0) selected = 0;
    selected = Math.min(selected, trees.length - 1);
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

    select.onchange = function(event) {
        if (weakChapterRunActive && !(event.detail && event.detail.weakRun)) stopWeakChapterRun();
        if (spacedReviewRunActive && !(event.detail && event.detail.spacedRun)) stopSpacedReviewRun();
        let v = document.getElementById(select_id).value;
        StorageAdapter.setItem(select_key, v);
        window.chapter = Number(v);
        start_training();
        update_progress(); // update the progress bar shown
        set_options_values_for_max_depth();  // update the max depth for the new chapter
        studyFeatureViews.forEach(view => view.update());
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
    if (readMode) return;
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
    const chapterSummaries = [];
    const now = new Date();

    for (let tree_index in trees) {
        const weakness = chapterWeakness(chapterStats, tree_index);
        const state = chapterProgressState(chapterStats, tree_index, chapterMoveCatalogs[tree_index], chapterReviewSignatures[tree_index]);
        const review = chapterReviewStatus(chapterReviews, tree_index, chapterReviewSignatures[tree_index], now);
        chapterSummaries.push({
            index: Number(tree_index),
            name: tree_chapter_name(tree_index),
            ...weakness,
            ...state,
            reviewDue: review.due,
            reviewDueAt: review.dueAt ? review.dueAt.getTime() : null,
            reviewLabel: review.due ? i18n.spaced_review_due
                : review.dueAt ? i18n.spaced_review_next + ": " + review.dueAt.toLocaleString() : null,
            pickerTone: review.due ? 'due' : state.mastered ? 'solid'
                : state.level === 'weak' || state.level === 'watch' ? 'mistakes' : state.covered > 0 ? 'in-progress' : 'new',
            pickerMetrics: chapter_practice_text(state.recent, true),
            current: Number(tree_index) === Number(chapter),
            recovery: i18n.progress_practiced_moves + ': ' + state.covered + '/' + state.total + ' (' + state.percent + '%)',
            metrics: chapter_performance_text(tree_index, state.recent)
        });
    }

    chapterSummaries.sort((a, b) => Number(b.reviewDue) - Number(a.reviewDue) || Number(a.mastered) - Number(b.mastered) || b.errorRate - a.errorRate || b.errors - a.errors || a.index - b.index);
    window.dispatchEvent(new CustomEvent("study-progress-updated", { detail: chapterSummaries }));
    clearTimeout(reviewRefreshTimer);
    const nextDueAt = chapterSummaries
        .filter(summary => summary.reviewDueAt && summary.reviewDueAt > now.getTime())
        .reduce((earliest, summary) => Math.min(earliest, summary.reviewDueAt), Infinity);
    if (Number.isFinite(nextDueAt)) {
        reviewRefreshTimer = setTimeout(update_progress, Math.min(nextDueAt - now.getTime() + 1000, 2147483647));
    }

    let cp = document.getElementById("chapter_progress");
    const current = chapterSummaries.find(summary => summary.current);
    const coverage = current;
    const mastery = current;
    const bar = document.createElement("div");
    bar.className = "progress-bar" + (mastery.mastered ? " progress-bar--solid" : "");
    bar.setAttribute("role", "meter");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(coverage.percent));
    bar.setAttribute("aria-label", i18n.progress_practiced_moves);
    const fill = document.createElement("span");
    fill.className = "progress-bar-fill";
    fill.style.width = coverage.percent + "%";
    bar.appendChild(fill);

    const label = document.createElement("p");
    label.className = "chapter-weakness chapter-weakness--" + current.level;
    label.textContent = i18n.progress_practiced_moves + ": " + coverage.covered + "/" + coverage.total + " (" + coverage.percent + "%)";
    const performance = document.createElement('p');
    performance.className = 'chapter-performance';
    performance.textContent = current.metrics;
    cp.replaceChildren(bar, label, performance);
    updateWeakChapterRunUi();
}

function setup_progress_modal() {
    const opener = document.getElementById("progress");
    const list = document.getElementById("study_progress");
    opener.addEventListener("click", event => {
        event.preventDefault();
        requestAnimationFrame(() => {
            const current = list.querySelector('[aria-current="true"]');
            if (!current) return;
            const offset = current.getBoundingClientRect().top - list.getBoundingClientRect().top;
            list.scrollTop += offset - (list.clientHeight - current.clientHeight) / 2;
        });
    });
}

async function setup_progress_reset() {
    let reset = document.getElementById("study_progress_reset");
    reset.onclick = function() {
        if (window.confirm(i18n.confirm_reset_progress)) {
            if (weakChapterRunActive) stopWeakChapterRun();
            if (spacedReviewRunActive) stopSpacedReviewRun();
            chapterReviews = emptyChapterReviews();
            StorageAdapter.setItem(chapter_reviews_key(), JSON.stringify(chapterReviews));
            for (let c of trees) {
                tree_value_add(c.root[0], -5);
            }
            chapterStats = { version: 1, chapters: {} };
            practiceChapter = null;
            if (!readMode) {
                beginChapterPractice(chapterStats, chapter, chapterReviewSignatures[chapter]);
                practiceChapter = chapter;
                lineEligibleForReview = false;
            }
            StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
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
    chapterStats = readChapterStats(StorageAdapter.getItem(chapter_stats_key()));
    chapterReviews = readChapterReviews(StorageAdapter.getItem(chapter_reviews_key()));
    setup_chapter_select();
    const chapterPgns = splitChapterPgn(pgn);
    const getCurrentChapter = () => chapterPgns[chapter] ? {
        pgn: chapterPgns[chapter],
        chapterIndex: Number(chapter),
        title: tree_chapter_name(Number(chapter)),
        study: document.querySelector('h1').textContent.trim(),
        studyPath: window.location.pathname
    } : null;
    studyFeatureViews = [
        setupStudyCollections({ getCurrentChapter }),
        setupStudyNavigation({ getCurrentChapter, goBack: go_back, goForward: go_forward, progressLabels: { unpracticed: i18n.progress_not_practiced, practiced: i18n.progress_practiced_moves, needsPractice: i18n.progress_needs_practice, reviewDue: i18n.spaced_review_due } })
    ];
    setupPuzzleRun(i18n);
    set_options_values();
    setup_move_handler(handle_move);
    setup_click_handler(handle_click);

    window.total_moves = 0;

    resize_ground();

    setup_intro();

    start_training();
    studyMoveNavigation = setupStudyMoveNavigation({
        goBack: go_back,
        goForward: go_forward,
        getState: () => ({
            canGoBack: !spacedReviewRunActive && curr_move.length > 1,
            canGoForward: !spacedReviewRunActive && tree_children(curr_move).length > 0
        })
    });
    setup_configs();
    studyMoveTree = setupStudyMoveTree({
        element: document.getElementById('study_read_moves'),
        onSelect: seek_read_move,
        startLabel: i18n.read_start_position,
        variationLabel: i18n.read_variation
    });
    update_read_mode_ui();
    window.addEventListener('study-reading-change', event => set_read_mode(event.detail.reading));
    window.addEventListener('study-reading-move', event => play_read_move(event.detail.move));
    window.addEventListener('study-puzzle-run-changed', () => set_read_mode(false));
    window.addEventListener('study-reading-layout-updated', () => {
        const navigation = document.getElementById('study_move_navigation');
        const container = document.getElementById(readMode ? 'study_moves_heading' : 'game_container');
        if (navigation.parentElement !== container) container.appendChild(navigation);
        resize_ground();
        overlay_manager.on_resize();
    });
    update_progress();
    setup_progress_modal();
    setup_progress_reset();
}

window.onresize = onresize;
main();

function update_read_mode_ui() {
    studyMoveTree.update({
        reading: readMode, chapter, root: trees[chapter].root,
        fen: trees[chapter].headers.FEN, path: curr_move.slice(1)
    });
    window.dispatchEvent(new CustomEvent('study-reading-updated', {
        detail: { reading: readMode, moves: readMode ? tree_children(curr_move).map(node => node.move) : [] }
    }));
}

function set_read_mode(reading) {
    if (readMode === reading) return;
    readMode = reading;
    if (reading) {
        if (weakChapterRunActive) stopWeakChapterRun();
        if (spacedReviewRunActive) stopSpacedReviewRun();
        window.dispatchEvent(new Event('study-puzzle-run-off'));
    }
    clear_all_text();
    start_training();
}

function play_read_move(san) {
    if (!readMode || !tree_children(curr_move).some(node => node.move === san)) return false;
    play_move(san);
    refresh_manual_navigation();
    return true;
}

function seek_read_move(path) {
    if (!readMode) return false;
    const position = readChapterPosition(trees[chapter].root, trees[chapter].headers.FEN, path);
    if (!position) return false;
    window.chess = position;
    window.curr_move = [chapter, ...path];
    refresh_manual_navigation();
    return true;
}

function refresh_manual_navigation() {
    finish_chapter_practice(false);
    trainingSessionId += 1;
    lineEligibleForReview = false;
    clear_all_text();
    setup_move();
}

function go_back() {
    if (spacedReviewRunActive || curr_move.length <= 1) return;
    chess.undo();
    curr_move.pop();
    refresh_manual_navigation();
}

function go_forward() {
    if (spacedReviewRunActive) return;
    const nextNode = tree_children(curr_move)[0];
    if (!nextNode) return;
    play_move(nextNode.move);
    refresh_manual_navigation();
}
