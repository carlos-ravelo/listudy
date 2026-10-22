import { selectStudyComments, projectStudyCommentRows } from './modules/study/comments.js';
import { registerStudyComments, publishStudyComments } from './components/study_comments.js';
import { projectStudyProgress } from './modules/study/progress_projection.js';
import { createProgressPublisher } from './modules/study/progress_publisher.js';
import { registerStudyRunStatus, publishStudyRunStatus } from './components/study_run_status.js';
import { createPracticeDepth } from './modules/study/practice_depth.js';
import { registerStudyDepth, bindStudyDepth } from './components/study_depth.js';
import { createStudyPreferences } from './modules/study/preferences.js';
import { registerStudyPreferences, bindStudyPreferences } from './components/study_preferences.js';
import { reconcileStudyProgress } from './modules/study/progress_preservation.js';
import { presentTacticsTrap } from './modules/study/tactics_trap.js';
import { tacticsMainline, tacticsCandidates, classifyTacticsMove } from './modules/study/tactics_mainline.js';
import { practiceDepthLimit, scopePositionCatalog } from './modules/study/practice_scope.js';
import { setupStudyFeedback } from './modules/study_feedback.js';
import { setupStudySessions } from './modules/study_sessions.js';
import { closeDialog, onDialogClosed } from './modules/dialog_lifecycle.js';
import { setupStudySparring } from './modules/sparring/study_adapter.js';
import { replayPositionContext } from './modules/study/position_context.js';
import { setupStudyVisualization } from './modules/study/visualization.js';
import { applyGameEvidence, gameLineTarget } from './modules/analysis/game_progress.js';
import { positionReviews, recordPositionReview, introducedMoves, recordIntroducedMove, introduceContinuation, recordContinuationReview, scheduledReviews, reviewExposureKey, continuationKey, nextSmartPosition } from './modules/study/position_review.js';
import { cachedPositionCatalog } from './modules/study/position_catalog_cache.js';
import { chapterFailures, recordPositionResult, pendingPositions } from './modules/study/failed_positions.js';
require("regenerator-runtime/runtime"); // required for sleep (https://github.com/babel/babel/issues/9849#issuecomment-487040428)

const Chessground = require('chessground').Chessground;
const Chess = require('chess.js')
import { turn_color, setup_chess, uci_to_san, cal_to_ucistr, move_to_ucistr } from './modules/chess_utils.js';
import { string_hash } from './modules/hash.js';
import { clear_local_storage } from './modules/localstorage.js';
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
import { lichessAnalysisUrl, prepareLichessAnalysis } from './modules/study/lichess_analysis.js';
import { setupStudyCollections } from './modules/study_collections.js';
import { setupStudyNavigation, setupStudyMoveNavigation, setupPuzzleRun } from './modules/study_page_controls.js';
import { readStudyActivity, requestedStudyActivity, trackStudyActivity } from './modules/study_activity.js';
import { readChapterStats, recordChapterAttempt, chapterMoveCatalog, chapterMastery, weakChapterOrder, beginChapterPractice, finishChapterPractice, bindChapterIdentities } from './modules/study/chapter_stats.js';
import { emptyChapterReviews, readChapterReviews, chapterReviewSignature, recordLineReview, chapterReviewStatus } from './modules/study/chapter_review.js';
import { setupStudyMoveTree, readChapterPosition } from './modules/study/study_move_tree.js';
import Alpine from 'alpinejs';

registerStudyPreferences(Alpine);
registerStudyDepth(Alpine);
registerStudyRunStatus(Alpine);
registerStudyComments(Alpine);
window.Alpine = Alpine;
Alpine.start();


let studyFeatureViews = [];
let chapterPgns = [];
let sparring = null;
let studyMoveNavigation = { update() {} };
let studyMoveTree = { update() {} };
let readMode = false;
let readingTrees = [];
let practiceTrees = [];
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
let tacticsTrap = null;
const studyColor = color;
let weakChapterRunActive = false;
let weakChapterQueue = [];
let failedPositionRun = null;
let smartSession = null;
let smartTarget = null;
let smartCatalog = [];
let positionAttempts = new Set();
let assistedPositions = new Set();
let contextReplayActive = false;
let visualization = null;
let gameLineQueue = null;
let studySessions = { begin() {}, decision() {}, end() {}, refresh() {}, clear() {}, boundary() { return false; } };

function updateContextReplayUi() {
    const button = document.getElementById('replay_position_context');
    if (!button) return;
    const practicingPosition = smartSession && smartTarget ||
        failedPositionRun && !failedPositionRun.transitioning && failedPositionRun.index < failedPositionRun.positions.length;
    button.hidden = readMode || !practicingPosition || !window.curr_move || curr_move.length <= 1;
    button.disabled = contextReplayActive;
}

async function presentPracticePosition(path, count = 0) {
    const replayChapter = chapter;
    const sessionId = ++trainingSessionId;
    contextReplayActive = true;
    lineEligibleForReview = false;
    const isCurrent = () => trainingSessionId === sessionId && chapter === replayChapter;
    try {
        await replayPositionContext({
            root: trees[chapter].root, fen: trees[chapter].headers.FEN, path, count, isCurrent,
            pause: sleep,
            present(position, prefix) {
                window.chess = position;
                window.curr_move = [replayChapter, ...prefix];
                clear_all_text();
                ground_init_state(position.fen(), color);
                setup_move();
            },
            advance(san) {
                play_move(san);
                setup_move();
            }
        });
    } finally {
        if (isCurrent()) {
            contextReplayActive = false;
            setup_move();
        }
    }
}

function replayContextFromStart() {
    if (currentTacticsTrap() || contextReplayActive || readMode || smartSession && !smartTarget ||
        failedPositionRun?.transitioning || !smartSession && !failedPositionRun) return;
    const path = curr_move.slice(1);
    presentPracticePosition(path, path.length);
}


function currentPositionId() {
    return curr_move.slice(1).map((_, depth) => tree_get_node(curr_move.slice(0, depth + 2)).move).join('|');
}

function scopedPracticeCatalog() {
    return scopePositionCatalog(smartCatalog, trees.map((_, index) => practiceDepthLimit(StorageAdapter, study_id, index)));
}

function smartIntroductionMove() {
    if (!smartSession || smartTarget?.type !== 'line' || smartTarget.reviewChain || !smartTarget.route ||
        readMode || contextReplayActive || turn_color(chess) !== color) return null;
    const path = curr_move.slice(1);
    if (path.length >= smartTarget.route.length || !path.every((index, depth) => index === smartTarget.route[depth])) return null;
    const move = tree_children(curr_move)[smartTarget.route[path.length]];
    if (!move) return null;
    const id = currentPositionId();
    const entry = chapterStats.chapters[chapterStats.chapterIds?.[chapter] || String(chapter)];
    const introduced = entry?.positionReviews?.signature === chapterReviewSignatures[chapter]
        ? entry.positionReviews.cards[id]?.introducedMoves || [] : [];
    if (introduced.includes(move.move) || entry?.coveredMoves?.includes((id ? id + '|' : '') + move.move)) return null;
    return move;
}

function selectNextSmartPosition() {
    if (!smartSession || (window.studyPuzzleRunMode ?? localStorage.getItem('puzzleRunMode')) !== 'smart') return;
    if (studySessions.boundary()) {
        smartTarget = null;
        updateContextReplayUi();
        trainingSessionId += 1;
        finish_chapter_practice(false);
        ground.set({ movable: { dests: new Map() } });
        publishStudyRunStatus('smart', i18n.smart_complete, true);
        return;
    }
    const { target, nextDue } = gameLineQueue
        ? { target: gameLineQueue.shift() || null, nextDue: null }
        : nextSmartPosition(chapterStats, chapterReviewSignatures, scopedPracticeCatalog(), smartSession);
    smartTarget = target;
    updateContextReplayUi();
    if (!target) {
        trainingSessionId += 1;
        finish_chapter_practice(false);
        ground.set({ movable: { dests: new Map() } });
        publishStudyRunStatus('smart', i18n.smart_complete + (nextDue ? ' · ' + i18n.spaced_review_next + ': ' + new Date(nextDue).toLocaleString() : ''), true);
        studySessions.boundary('no-work');
        return;
    }
    smartSession.lastChapter = target.chapter;
    smartSession.presentation = (smartSession.presentation || 0) + 1;
    publishStudyRunStatus('smart', target.reviewChain ? (target.longReview ? i18n.smart_long_review : '')
        : target.type === 'line' ? i18n.smart_learning : i18n.smart_review);
    const select = document.getElementById('chapter_select');
    select.value = String(target.chapter);
    select.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { smartRun: true } }));
    if (target.path.length || target.type === 'position') {
        const entry = positionReviews(chapterStats, chapter, chapterReviewSignatures[chapter])[target.id];
        const review = target.expectedMove ? entry?.moveReviews?.[target.expectedMove] || entry : entry;
        const needsContext = target.type === 'line' || !review || !review.recovered;
        presentPracticePosition(target.path, needsContext ? 4 : 0);
    }
}

function updateSmartRun(initialGameTarget = null) {
    studySessions.end();
    failedPositionRun = null;
    updateFailedPositionsUi();
    smartSession = null;
    smartTarget = null;
    gameLineQueue = initialGameTarget?.fromGame ? [initialGameTarget] : null;
    publishStudyRunStatus('smart', '', false);
    if ((window.studyPuzzleRunMode ?? localStorage.getItem('puzzleRunMode')) === 'smart') {
        smartSession = { newCount: 0, reviewCount: 0, reviewStreak: 0, lastChapter: null };
        studySessions.begin('smart');
        set_read_mode(false);
        selectNextSmartPosition();
    } else if (!readMode) start_training();
}


function currentFailures() {
    return chapterFailures(chapterStats, chapter, chapterReviewSignatures[chapter]);
}

function updateFailedPositionsUi() {
    publishStudyRunStatus('failed', failedPositionRun
        ? failedPositionRun.index < failedPositionRun.positions.length
            ? i18n.failed_position + ' ' + (failedPositionRun.index + 1) + '/' + failedPositionRun.positions.length
            : i18n.failed_positions_complete
        : '', Boolean(failedPositionRun));
}

function showFailedPosition() {
    const run = failedPositionRun;
    if (!run) return;
    positionAttempts = new Set();
    assistedPositions = new Set();
    trainingSessionId += 1;
    contextReplayActive = false;
    run.transitioning = false;
    clear_all_text();
    while (run.index < run.positions.length) {
        const item = run.positions[run.index];
        const position = readChapterPosition(trees[chapter].root, trees[chapter].headers.FEN, item.path);
        if (position && position.fen() === item.fen) {
            presentPracticePosition(item.path, 4);
            updateFailedPositionsUi();
            return;
        }
        run.index += 1;
    }
    if (weakChapterRunActive && weakChapterQueue.length) {
        selectNextWeakChapter();
        return;
    }
    if (weakChapterRunActive) stopWeakChapterRun();
    ground.set({ movable: { dests: new Map() } });
    set_text(success_div, i18n.failed_positions_complete);
    updateFailedPositionsUi();
}

function startFailedPositions() {
    const positions = pendingPositions(currentFailures());
    if (!positions.length) return;
    if (spacedReviewRunActive) stopSpacedReviewRun();
    window.dispatchEvent(new Event('study-puzzle-run-off'));
    readMode = false;
    if (tacticsCollection) window.trees = practiceTrees;
    finish_chapter_practice(false);
    lineEligibleForReview = false;
    failedPositionRun = { positions, index: 0 };
    showFailedPosition();
}

const mode_free = "free_mode";


let combo_count = 0;

/* Suggestions seen during the current session */
let seen_suggestions = [];

const tacticsCollection = document.querySelector('[data-training-kind="tactics"]') !== null;
const preferences = createStudyPreferences({ storage: StorageAdapter, labels: i18n, tactics: tacticsCollection });

// Option to control the maximum number of moves being played
const practiceDepth = createPracticeDepth({ storage: StorageAdapter, studyId: study_id });
let practiceDepthView;
let depthSettingsChanged = false;
const progressPublisher = createProgressPublisher({
    project: now => {
        const catalog = scopedPracticeCatalog();
        return projectStudyProgress({
            stats: chapterStats, moveCatalogs: chapterMoveCatalogs, signatures: chapterReviewSignatures,
            catalog, chapterNames: trees.map((_, index) => tree_chapter_name(index)),
            currentChapter: chapter, storage: StorageAdapter, studyId: study_id,
            reviews: trees.map((_, index) => studyReviewStatus(index, now, catalog)), labels: i18n, now
        });
    },
    publish: summaries => window.dispatchEvent(new CustomEvent('study-progress-updated', { detail: summaries })),
    afterUpdate: updateWeakChapterRunUi
});

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

function currentTacticsTrap() {
    if (tacticsTrap && (tacticsTrap.sessionId !== trainingSessionId || readMode || sparring?.active)) {
        tacticsTrap = null;
        visualization?.endFailure();
        updateTacticsTrapUi();
    }
    return tacticsTrap;
}

function updateTacticsTrapUi() {
    const actions = document.getElementById('study_tactics_failure');
    if (actions) actions.hidden = !tacticsTrap?.failed;
    document.getElementById('hints').disabled = !!tacticsTrap;
}

function renderTacticsTrap(board, move) {
    ground.set({ animation: { enabled: true } });
    ground_move(move, board);
    ground.set({ fen: board.fen(), turnColor: turn_color(board), check: board.in_check(),
        lastMove: [move.from, move.to], movable: { dests: new Map() } });
}

function retryTacticsTrap() {
    if (!currentTacticsTrap()?.failed) return;
    tacticsTrap = null;
    visualization?.endFailure();
    updateTacticsTrapUi();
    clear_all_text();
    setup_move();
}

function showTacticsSolution() {
    if (!currentTacticsTrap()?.failed) return;
    const path = curr_move.slice(1);
    set_read_mode(true);
    seek_read_move(path);
}

async function handle_move(orig, dest) {
    if (currentTacticsTrap()) return;
    if (sparring?.active) { await sparring.move(orig, dest); return; }
    if (contextReplayActive) return;
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
    if (smartSession && !smartTarget) return;
    if (failedPositionRun && (failedPositionRun.transitioning || failedPositionRun.index >= failedPositionRun.positions.length)) return;
    const sessionId = trainingSessionId;

    clear_all_text();

    let san = uci_to_san(chess, orig, dest);

    let possible_moves = tree_possible_moves(curr_move).map(m => m.move);

    const candidates = tacticsCollection ? tacticsCandidates(practiceTrees[chapter], curr_move.slice(1)) : [];
    let possible_promotion_san = possible_promotion(tacticsCollection ? candidates.map(node => node.move) : possible_moves, san);
    // the move automatically promoted to a queen, above we checked if it was
    // also possible to underpromote, if so we returned that san instead
    if (possible_promotion_san != "") {
        san = possible_promotion_san;
    }

    const result = tacticsCollection ? classifyTacticsMove(candidates, san) : null;
    if (result?.kind === 'alternative') {
        ground_undo_last_move();
        setup_move();
        set_text(info_div, i18n.tactics_commented_variation);
        return;
    }
    let trap = null;
    if (result?.kind === 'trap') {
        trap = { sessionId, failed: false, board: new Chess(chess.fen()) };
        tacticsTrap = trap;
        updateTacticsTrapUi();
        ground.set({ movable: { dests: new Map() } });
        ground.setShapes([]);
        overlay_manager.clear_overlays();
        publishStudyComments();
        studyMoveNavigation.update();
        visualization?.previewFailure();
        const board = await presentTacticsTrap({ board: trap.board, node: result.node,
            render: renderTacticsTrap, wait: sleep,
            isCurrent: () => currentTacticsTrap() === trap });
        if (!board || currentTacticsTrap() !== trap) return;
    }
    overlay_manager.mark_current_overlays_seen();
    const introduction = trap ? null : smartIntroductionMove();
    if (!introduction) total_moves += 1;
    const wasCorrect = !trap && possible_moves.indexOf(san) != -1;
    visualization?.decision(wasCorrect, assistedPositions.has(currentPositionId()) || positionAttempts.has(currentPositionId()));
    if (wasCorrect && smartTarget && (smartTarget.route || smartTarget.expectedMove)) {
        const nextIndex = smartTarget.route?.[curr_move.length - 1];
        const intended = smartTarget.expectedMove || tree_children(curr_move)[nextIndex]?.move;
        if (intended && san !== intended) {
            ground_undo_last_move();
            set_text(info_div, i18n.smart_other_continuation);
            setup_move();
            return;
        }
    }
    const positionId = currentPositionId();
    const moveId = wasCorrect
        ? (positionId ? positionId + '|' : '') + san
        : null;
    if (introduction) {
        lineEligibleForReview = false;
        if (!wasCorrect) {
            ground_undo_last_move();
            setup_move();
            set_text(info_div, i18n.smart_introduction_retry);
            return;
        }
        const cards = positionReviews(chapterStats, chapter, chapterReviewSignatures[chapter]);
        introduceContinuation(cards, positionId, introduction.move);
        cards[positionId].positionFen = chess.fen().split(' ').slice(0, 4).join(' ');
        cards[positionId].expected = possible_moves;
        smartSession.newCount += 1;
        smartSession.reviewStreak = 0;
        studySessions.decision('smart', `${smartSession.presentation}|${chapter}|${positionId}`, true, true, true);
        StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
    } else {
        const assisted = assistedPositions.has(positionId) || positionAttempts.has(positionId);
        const cards = positionReviews(chapterStats, chapter, chapterReviewSignatures[chapter]);
        const firstAttempt = !positionAttempts.has(positionId);
        if (firstAttempt) studySessions.decision(smartSession ? 'smart' : failedPositionRun ? 'positions' : 'lines',
            `${smartSession ? smartSession.presentation : trainingSessionId}|${chapter}|${positionId}`, false, wasCorrect, assisted);
        const intendedMove = smartTarget?.type === 'line' && smartTarget.route
            ? tree_children(curr_move)[smartTarget.route[curr_move.length - 1]]?.move
            : smartTarget?.expectedMove || (wasCorrect ? san : possible_moves[0]);
        const previousCard = cards[positionId]?.card;
        const wasNew = !cards[positionId] || !introducedMoves(chapterStats, chapter, chapterReviewSignatures[chapter], positionId).includes(intendedMove);
        const review = recordPositionReview(cards, positionId, wasCorrect, assisted, positionAttempts);
        cards[positionId].positionFen = chess.fen().split(' ').slice(0, 4).join(' ');
        cards[positionId].expected = possible_moves;
        const continuationReview = recordContinuationReview(cards, positionId, intendedMove, wasCorrect, assisted,
            firstAttempt, wasNew, previousCard);
        if (wasCorrect) recordIntroducedMove(cards, positionId, san);
        if (smartSession && firstAttempt) {
            (smartSession.testedContinuations ||= new Set()).add(continuationKey(chapter, positionId, intendedMove));
            if (wasCorrect && !assisted) (smartSession.recalledOpenings ||= new Set()).add(reviewExposureKey(chess.fen(), san));
            if (smartTarget?.type === 'line' && !smartTarget.reviewChain && wasNew) {
                smartSession.newCount += 1;
                smartSession.reviewStreak = 0;
            } else if (review || continuationReview) {
                smartSession.reviewCount = (smartSession.reviewCount || 0) + 1;
                smartSession.reviewStreak = (smartSession.reviewStreak || 0) + 1;
            }
        }
        if (assisted && !lineReviewRecorded && lineEligibleForReview) record_line_review(false);
        const recovery = continuationReview || review || cards[positionId];
        const unresolvedContinuation = Object.values(cards[positionId]?.moveReviews || {})
            .some(entry => !entry.recovered && (!entry.introducedAt || entry.card.reps > 0));
        const gradedRecovery = recovery && (!recovery.introducedAt || recovery.card.reps > 0) ? recovery : null;
        recordPositionResult(currentFailures(), positionId, {
            path: curr_move.slice(1), fen: chess.fen(), played: san, expected: possible_moves
        }, wasCorrect, gradedRecovery && { ...gradedRecovery, recovered: gradedRecovery.recovered && !unresolvedContinuation });
        if (trap) {
            record_chapter_attempt(false, null, positionId, assisted);
            update_value(curr_move, 0);
            combo_count = 0;
            if (!lineReviewRecorded && lineEligibleForReview) record_line_review(false);
            trap.failed = true;
            visualization?.finishFailure();
            updateTacticsTrapUi();
            set_text(error_div, i18n.tactics_trap_failed);
            setup_move();
            document.getElementById('study_tactics_retry')?.focus();
            updateFailedPositionsUi();
            update_progress();
            return;
        }
        if (smartTarget?.type === 'position') {
            record_chapter_attempt(wasCorrect, wasCorrect && !assisted ? moveId : null, positionId, assisted);
            if (wasCorrect) {
                play_move(san);
                ground.set({ movable: { dests: new Map() } });
                smartTarget = null;
                await sleep(500);
                if (sessionId === trainingSessionId) selectNextSmartPosition();
            } else {
                ground_undo_last_move();
                set_text(error_div, i18n.error_wrong_move);
                setup_move();
            }
            update_progress();
            return;
        }
        if (failedPositionRun) {
            record_chapter_attempt(wasCorrect, wasCorrect && !assisted ? moveId : null, positionId, assisted);
            StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
            if (wasCorrect) {
                play_move(san);
                ground.set({ movable: { dests: new Map() } });
                failedPositionRun.index += 1;
                failedPositionRun.transitioning = true;
                await sleep(500);
                if (sessionId !== trainingSessionId) return;
                showFailedPosition();
            } else {
                ground_undo_last_move();
                set_text(error_div, i18n.error_wrong_move);
                setup_move();
            }
            updateFailedPositionsUi();
            update_progress();
            return;
        }
        record_chapter_attempt(wasCorrect, wasCorrect && !assisted ? moveId : null, positionId, assisted);
        updateFailedPositionsUi();
        if (!wasCorrect && !lineReviewRecorded && lineEligibleForReview) record_line_review(false);
    }

    if(wasCorrect) {
        // console.log('curr_move', orig, dest, JSON.stringify(curr_move));
        // the move is one of the possible moves in the current position
        update_value(curr_move, 1, san);
        play_move(san);
        combo_count += 1;
        set_text(success_div, right_move_text());
        let reply = ai_move(curr_move);
        const naturalEnd = reply == undefined && (!smartTarget?.route || smartTarget.completeLine === true);
        let end_of_line = reply == undefined;
        if (!end_of_line && !spacedReviewRunActive && !smartSession && Number.isFinite(practiceDepth.limit)) {
            let curr_node = tree_get_node(curr_move);
            let curr_depth = tree_get_node_depth(curr_node);
            if (window.studyFullLines || preferences.get('keyMoves') == i18n.key_move_disabled || window.first_variation === null) {
                end_of_line = curr_depth >= practiceDepth.limit;
            } else {
                end_of_line = curr_node.move_index >= window.first_variation && curr_depth >= practiceDepth.limit;
            }
            // console.log('CURR_DEPTH', end_of_line, curr_node.move, curr_node.move_index, curr_depth);
        }
        if (visualization?.active) ground.set({ movable: { dests: new Map() } });
        await sleep(get_move_delay()); // instant play by the ai feels weird
        if (sessionId !== trainingSessionId) return;
        if (end_of_line) {
            finish_chapter_practice(naturalEnd && lineEligibleForReview);
            if (naturalEnd && !lineReviewRecorded && lineEligibleForReview) record_line_review(true);
            achievement_end_of_line();
            set_text(success_div, right_move_text() + "\n" + (smartTarget?.type === 'line' ? i18n.smart_chain_complete : i18n.success_end_of_line));

            if (visualization?.active) {
                visualization.settle(true);
                setup_move();
                update_progress();
                return;
            }

            // Auto-advance to the specific chapter type if Puzzle Run is active
            const currentRunMode = window.studyPuzzleRunMode ?? localStorage.getItem("puzzleRunMode");

            if (smartSession) {
                if (smartTarget?.reviewChain) smartSession.reviewChains = (smartSession.reviewChains || 0) + 1;
                smartTarget = null;
                setTimeout(() => { if (sessionId === trainingSessionId) selectNextSmartPosition(); }, 500);
            } else if (spacedReviewRunActive) {
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
                if (preferences.get('review') == i18n.review_slow) {
                    await sleep(3000);
                }
                if (sessionId !== trainingSessionId) return;
                start_training();
            }
        } else {
            play_move(reply);
            visualization?.reply(reply);
            visualization?.settle(false);
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
    setup_move();
    update_progress();
}

function updateWeakChapterRunUi() {
    publishStudyRunStatus('weak', spacedReviewRunActive
        ? i18n.spaced_review_active + " · " + (spacedReviewQueue.length + 1) + " " + i18n.weak_run_remaining
        : weakChapterRunActive
            ? i18n.weak_run_active + " · " + (weakChapterQueue.length + 1) + " " + i18n.weak_run_remaining
            : "", weakChapterRunActive || spacedReviewRunActive);
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
    if (document.getElementById('weak_practice_mode').value === 'positions') startFailedPositions();
    updateWeakChapterRunUi();
}

function toggleWeakChapterRun() {
    if (weakChapterRunActive) {
        stopWeakChapterRun();
        if (failedPositionRun) start_training();
        return;
    }
    weakChapterQueue = weakChapterOrder(chapterStats, trees.length, chapterMoveCatalogs);
    if (document.getElementById('weak_practice_mode').value === 'positions') {
        weakChapterQueue = trees.map((_, index) => index)
            .filter(index => pendingPositions(chapterFailures(chapterStats, index, chapterReviewSignatures[index])).length > 0)
            .sort((a, b) => pendingPositions(chapterFailures(chapterStats, b, chapterReviewSignatures[b])).length -
                pendingPositions(chapterFailures(chapterStats, a, chapterReviewSignatures[a])).length);
    }
    if (weakChapterQueue.length === 0) return;
    set_read_mode(false);
    if (spacedReviewRunActive) stopSpacedReviewRun();
    weakChapterRunActive = true;
    window.dispatchEvent(new Event("study-puzzle-run-off"));
    closeDialog(document.getElementById("progress_modal"));
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
    spacedReviewQueue = trees.map((_, index) => ({ index, ...studyReviewStatus(index) }))
        .filter(item => item.due).sort((a, b) => a.dueAt - b.dueAt).map(item => item.index);
    if (spacedReviewQueue.length === 0) return;
    set_read_mode(false);
    if (weakChapterRunActive) stopWeakChapterRun();
    spacedReviewRunActive = true;
    window.dispatchEvent(new Event("study-puzzle-run-off"));
    closeDialog(document.getElementById("progress_modal"));
    selectNextDueChapter();
}

function studyReviewStatus(index, now = new Date(), catalog = scopedPracticeCatalog()) {
    const cards = catalog.filter(item => item.chapter === Number(index))
        .flatMap(item => scheduledReviews(chapterStats, chapterReviewSignatures[index], item).map(scheduled => scheduled.review));
    if (!cards.length) return Number.isFinite(practiceDepthLimit(StorageAdapter, study_id, index))
        ? { due: false, dueAt: null } : chapterReviewStatus(chapterReviews, index, chapterReviewSignatures[index], now);
    const dates = cards.map(entry => new Date(entry.card.due)).filter(date => Number.isFinite(date.getTime()));
    const dueAt = dates.length ? new Date(Math.min(...dates.map(date => date.getTime()))) : null;
    return { due: dueAt !== null && dueAt <= now, dueAt };
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

function record_chapter_attempt(wasCorrect, moveId, positionId, assisted = false) {
    recordChapterAttempt(chapterStats, chapter, wasCorrect, moveId, positionId, assisted);
    StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
}

function finish_chapter_practice(completed) {
    if (practiceChapter === null) return;
    finishChapterPractice(chapterStats, practiceChapter, completed);
    practiceChapter = null;
    StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
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
    if (smartSession && !once) return !!smartIntroductionMove();
    if (once || preferences.get('arrows') == i18n.arrows_always) {
        return true;
    }

    let all_moves = tree_possible_moves(curr_move);
    let min = Math.min(...all_moves.map(m => m.value));
    if (preferences.get('arrows') == i18n.arrows_new2x && min < 2 ||
        preferences.get('arrows') == i18n.arrows_new5x && min < 5) {
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
    if (currentTacticsTrap()) { ground.setShapes([]); return; }
    if (visualization?.hidden) { ground.setShapes([]); overlay_manager.clear_overlays(); return; }
    if (contextReplayActive) { ground.setShapes([]); return; }
    let shapes = [];
    let all_moves = tree_possible_moves(curr_move);
    let current_move = tree_get_node(curr_move);
    let min = Math.min(...all_moves.map(m => m.value));
    let max = Math.max(...all_moves.map(m => m.value));

    overlay_manager.clear_overlays();
    const introduction = smartIntroductionMove();
    if (introduction) {
        lineEligibleForReview = false;
        ground.setShapes([create_arrow_from_move(introduction.move, 'normal')]);
        return;
    }
    if (!give_hints(once)) {
        ground.setShapes([]);
        return;
    }

    if (preferences.get('arrowType') == i18n.arrow_type_playable) {
        shapes.push(...all_moves.map(m => create_playable_arrow(m, max, min)));

    } else if (preferences.get('arrowType') == i18n.arrow_type_pgn) {
        let all_pgn_circles = get_pgn_shapes(current_move, "csl");
        let all_pgn_arrows = get_pgn_shapes(current_move, "cal");

        shapes.push(...all_pgn_circles.map(a => create_pgn_circle(a)));
        shapes.push(...all_pgn_arrows.map(a => create_pgn_arrow(a)));

        overlay_manager.setup_arrow_overlays(all_moves, all_pgn_arrows, max, min, true);

    } else if (preferences.get('arrowType') === i18n.arrow_type_both) {
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
    if (shapes.length) assistedPositions.add(currentPositionId());
    ground.setShapes(shapes);
}

function display_comments(once) {
    if (currentTacticsTrap()) return;
    if (visualization?.hidden) { publishStudyComments(); return; }
    const introduction = smartIntroductionMove();
    if (contextReplayActive || smartSession && !once && !introduction) { publishStudyComments(); return; }
    const visible = introduction || readMode || once || preferences.get('comments') == i18n.comments_always_on ||
        preferences.get('comments') == i18n.comments_when_arrows && give_hints(once);
    const selection = selectStudyComments({
        currentMove: tree_get_node(curr_move), responses: tree_children(curr_move),
        visible, introduction, reading: readMode
    });
    if (selection.assisted) assistedPositions.add(currentPositionId());
    publishStudyComments(projectStudyCommentRows(selection, {
        turnColor: turn_color(chess), formatMove: tree_get_node_string,
        responseLabel: i18n.response, decode: unescape_string
    }));
}

function change_play_stockfish() {
    let fen = chess.fen();
    let link = document.getElementById("play_stockfish");
    let base = link.href.split("#")[0];
    link.href = `${base}#${fen}`;
}

function change_analysis_board() {
    const link = document.getElementById('analysis_board');
    const source = chapterPgns[trees[chapter].sourceIndex];
    link.href = lichessAnalysisUrl(source, ground.state.orientation, chess.fen(), curr_move.slice(1));
    link.onclick = () => prepareLichessAnalysis(source, link.dataset.importPrompt);
}

function setup_move() {
    const trap = currentTacticsTrap();
    if (trap) {
        ground.set({ fen: trap.board.fen(), turnColor: turn_color(trap.board),
            check: trap.board.in_check(), movable: { dests: new Map() } });
        ground.setShapes([]);
        overlay_manager.clear_overlays();
        studyMoveNavigation.update();
        return;
    }
    if (sparring?.active) { sparring.render(); return; }
    visualization?.block(contextReplayActive || !!failedPositionRun || spacedReviewRunActive || weakChapterRunActive || !!smartSession);
    updateContextReplayUi();
    if (contextReplayActive) {
        const last = chess.history({ verbose: true }).slice(-1)[0];
        ground.set({ fen: chess.fen(), turnColor: turn_color(chess),
            lastMove: last ? [last.from, last.to] : undefined,
            check: chess.in_check(), movable: { dests: new Map() } });
        ground.setShapes([]);
        overlay_manager.clear_overlays();
        publishStudyComments();
        change_play_stockfish();
        change_analysis_board();
        studyMoveNavigation.update();
        return;
    }
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
    if (smartTarget?.type === 'line') {
        publishStudyRunStatus('smart', smartTarget.reviewChain
            ? (smartTarget.longReview ? i18n.smart_long_review : '')
            : smartIntroductionMove() ? i18n.smart_introduction : i18n.smart_learning);
    }
    studyMoveNavigation.update();
    update_read_mode_ui();
    visualization?.render();
}

/*
 * Returns the ai move that should be played for the access position
 */
function ai_move(access) {
    if (smartTarget?.type === 'line' && access[0] === smartTarget.chapter) {
        const path = access.slice(1);
        if (smartTarget.route && path.every((index, depth) => index === smartTarget.route[depth])) {
            if (path.length >= smartTarget.route.length) return undefined;
            return tree_children(access)[smartTarget.route[path.length]]?.move;
        }
        if (path.length < smartTarget.path.length && path.every((index, depth) => index === smartTarget.path[depth])) {
            return tree_children(access)[smartTarget.path[path.length]].move;
        }
    }
    //console.log('Finding moves after ' + (tree_get_node(access).move_index > 0 ? tree_get_node_string(tree_get_node(access)) : 'starting position'));

    let candidates = tacticsCollection
        ? tree_children(access).filter(has_children)
        : tree_children_filter_sort(access, {filter: has_children});
    let m = tacticsCollection
        ? candidates[Math.floor(Math.random() * candidates.length)]?.move
        : tree_size_weighted_random_move(candidates);

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
    tacticsTrap = null;
    updateTacticsTrapUi();
    if (tacticsCollection) window.trees = readMode ? readingTrees : practiceTrees;
    visualization?.reset();
    if (sparring?.active) { sparring.stop(); studySessions.end(); }
    if (!readMode) studySessions.begin(smartSession ? 'smart' : 'lines');
    contextReplayActive = false;
    failedPositionRun = null;
    updateFailedPositionsUi();
    finish_chapter_practice(false);
    trainingSessionId += 1;
    positionAttempts = new Set();
    assistedPositions = new Set();
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
    if (tacticsCollection && trees[chapter].user_color) {
        color = trees[chapter].user_color;
    } else if (base_fen !== start_base_fen) {
        color = turn_color(chess);
    }
    
    // Pass the active color to auto-rotate the board
    ground_init_state(fen, color);
    if (!readMode && !spacedReviewRunActive && !smartSession && !window.studyFullLines && preferences.get('keyMoves') == i18n.key_move_enabled && window.first_variation !== null) {
        for (let ki = 0; ki < window.first_variation; ++ki) {
            // Moves that are not fully trained are not skipped
            if (tree_children(curr_move)[0]?.value != 5) { break; }
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
    if (!readMode && tree_children(curr_move).length && color != turn_color(chess)) {
        const reply = ai_move(curr_move);
        if (reply !== undefined) play_move(reply);
    }
    if (!readMode) {
        beginChapterPractice(chapterStats, chapter, chapterReviewSignatures[chapter]);
        practiceChapter = chapter;
        StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
    }
    setup_move();

    if (!readMode && tacticsCollection && !chapterMoveCatalogs[chapter].size) {
        ground.set({ movable: { dests: new Map() } });
        set_text(info_div, i18n.tactics_no_mainline_moves || i18n.no_playable_chapters);
    }

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

// Rebuild the playable trees from the source PGN.
function setup_trees() {
    chapterPgns = splitChapterPgn(pgn);
    let trees = {};
    const pgnParser = require('pgn-parser'); 
    
    try {
        const parsedpgn = pgnParser.parse(pgn);
        annotate_pgn(parsedpgn);
        trees = generate_move_trees(parsedpgn, { tactics: tacticsCollection });
    } catch(caught_error) {
        console.log(caught_error);
        if (caught_error.location) {
            let error_text = caught_error.name + " at line: " + caught_error.location.start.line +
                             ", character: " + caught_error.location.start.column + "; Unexpected: \"" +
                             caught_error.found + "\"";
            set_text(error_div, error_text);
        }
    }
    
    readingTrees = trees;
    practiceTrees = tacticsCollection ? tacticsMainline(trees, studyColor) : trees;
    trees = practiceTrees;
    window.trees = trees;
    chapterReviewSignatures = trees.map(tree => chapterReviewSignature(tree.root, tree.headers.FEN));
    const standardFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
    chapterMoveCatalogs = trees.map(tree => {
        const fen = tree.headers.FEN || standardFen;
        const customPosition = fen.split(" ").slice(0, 4).join(" ") !== standardFen;
        const playerStarts = tree.user_color ? !tree.has_introductory_move : customPosition || studyColor === "white";
        return chapterMoveCatalog(tree.root, playerStarts);
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
        closeDialog(document.getElementById("progress_modal"));
    });
    document.getElementById("progress_modal").addEventListener("study-progress-toggle-weak-run", toggleWeakChapterRun);
    document.getElementById("progress_modal").addEventListener("study-progress-toggle-spaced-run", toggleSpacedReviewRun);
    window.addEventListener("study-puzzle-run-changed", stopWeakChapterRun);
    window.addEventListener("study-puzzle-run-changed", stopSpacedReviewRun);
    window.addEventListener('study-puzzle-run-changed', updateSmartRun);
    window.addEventListener('study-puzzle-run-off', () => {
        studySessions.end();
        if (contextReplayActive) { trainingSessionId += 1; contextReplayActive = false; }
        smartSession = null;
        smartTarget = null;
        publishStudyRunStatus('smart', '', false);
        updateContextReplayUi();
    });
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
        if (sparring?.active) { sparring.stop(); studySessions.end(); }
        if (smartSession && !event.detail?.smartRun) window.dispatchEvent(new Event('study-puzzle-run-off'));
        if (weakChapterRunActive && !(event.detail && event.detail.weakRun)) stopWeakChapterRun();
        if (spacedReviewRunActive && !(event.detail && event.detail.spacedRun)) stopSpacedReviewRun();
        let v = document.getElementById(select_id).value;
        StorageAdapter.setItem(select_key, v);
        window.chapter = Number(v);
        start_training();
        practiceDepthView.refresh(chapter, get_repertoire_depth());
        update_progress(); // update the progress bar shown
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
    if (visualization?.hidden) return;
    let suggestions = [
        {expr: function(){ return show_pgn_arrow_hints() },           text: i18n.suggestion_first_pgn_arrow, once: false, key: TextOverlayId.FIRST_PGN_ARROW},
        {expr: function(){ return show_neglected_move_hints() },      text: i18n.suggestion_first_neglected_move, once: false, key: TextOverlayId.FIRST_NEGLECTED_MOVE},
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

function turn_on_hints_for_current_move() {
    if (sparring?.active) { sparring.hint(); return; }
    if (currentTacticsTrap() || readMode || contextReplayActive) return;
    visualization?.reveal();
    assistedPositions.add(currentPositionId());
    display_arrows(true);
    display_comments(true);
}

function get_move_delay() {
    let delay = 300;
    switch (preferences.get('moveDelay')) {
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
            console.log("Got non supported move delay: ", preferences.get('moveDelay'));
            delay = 300;
    }
    return delay;
}

function get_repertoire_depth() {
    let starting_moves = trees[chapter].root;
    if (!starting_moves.length) return 1;
    let for_white = color == "white";
    return tree_max_num_moves_deep(starting_moves, for_white);
}

function practiceDepthChanged() {
    depthSettingsChanged = true;
    update_progress();
}

function reset_line() {
    if (sparring?.active) { sparring.start(); return; }
    if (smartSession) { selectNextSmartPosition(); return; }
    start_training();
}

function update_progress() {
    progressPublisher.update();
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
            window.dispatchEvent(new Event('study-puzzle-run-off'));
            const resetId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
            const resetAt = Date.now();
            chapterReviews = { ...emptyChapterReviews(), resetId, resetAt };
            bindChapterIdentities(chapterReviews, trees);
            StorageAdapter.setItem(chapter_reviews_key(), JSON.stringify(chapterReviews));
            for (let c of trees) {
                tree_value_add(c.root[0], -5);
            }
            failedPositionRun = null;
            const studyHistory = chapterStats.studySessions;
            chapterStats = { version: 1, chapters: {}, resetId, resetAt, ...(studyHistory ? { studySessions: studyHistory } : {}) };
            studySessions.clear();
            bindChapterIdentities(chapterStats, trees);
            practiceChapter = null;
            if (!readMode) {
                beginChapterPractice(chapterStats, chapter, chapterReviewSignatures[chapter]);
                practiceChapter = chapter;
                lineEligibleForReview = false;
            }
            StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
            if (!readMode) start_training();
            updateFailedPositionsUi();
            update_progress();
            display_arrows(false);
            display_comments(false);
        }
    }
}

async function handle_click() {
    if (currentTacticsTrap()) return;
    // Clearing the overlays here emulates the behaviour of normal arrows in chessground,
    // which disappear when you click on the chess board.
    overlay_manager.clear_overlays();
}

function setup_configs() {
    const trapRetry = document.getElementById('study_tactics_retry');
    const trapSolution = document.getElementById('study_tactics_solution');
    if (trapRetry) trapRetry.onclick = retryTacticsTrap;
    if (trapSolution) trapSolution.onclick = showTacticsSolution;

    document.getElementById('replay_position_context').onclick = replayContextFromStart;
    document.getElementById("hints").onclick = turn_on_hints_for_current_move;
    document.getElementById("reset_line").onclick = reset_line;
    onDialogClosed(document.getElementById('study_settings_dialog'), () => {
        if (!depthSettingsChanged) return;
        depthSettingsChanged = false;
        if (readMode) return;
        if (smartSession) {
            trainingSessionId += 1;
            contextReplayActive = false;
            selectNextSmartPosition();
        } else if (!failedPositionRun) start_training();
    });
}

window.overlay_manager = new TextOverlayManager();

async function loadGamePositions() {
    const url = document.querySelector('[data-game-positions-url]')?.dataset.gamePositionsUrl;
    if (!url) return null;
    try {
        const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        return response.ok ? (await response.json()).positions : null;
    } catch (_) { return null; }
}

async function refreshGameEvidence(positionsRequest) {
    const positions = await positionsRequest;
    if (!positions || !applyGameEvidence(chapterStats, chapterReviewSignatures, smartCatalog, positions, new Date(), true).changed) return;
    StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
    studySessions.refresh();
    update_progress();
}

async function main() {
    setupStudyFeedback();
    const gamePositionsRequest = loadGamePositions();
    // 1. If the user is authenticated, try to fetch cloud progress/settings
    if (typeof logged_in !== 'undefined' && logged_in) {
        try {
            await StorageAdapter.hydrate(study_id);
        } catch (error) {
            console.log("Ignored cloud sync fetch error: ", error);
        }
    }

    if (!(typeof logged_in !== 'undefined' && logged_in)) await StorageAdapter.ready(study_id);
    preferences.reload();
    setup_ground();
    setup_chess();
    setup_trees();
    if (!trees.length) {
        resize_ground();
        set_text(info_div, i18n.no_playable_chapters);
        document.getElementById('current_chapter_title').textContent = i18n.no_playable_chapters;
        document.getElementById('current_chapter_title').disabled = true;
        return;
    }
    chapterStats = readChapterStats(StorageAdapter.getItem(chapter_stats_key()));
    chapterReviews = readChapterReviews(StorageAdapter.getItem(chapter_reviews_key()));
    if (bindChapterIdentities(chapterStats, trees)) StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
    if (bindChapterIdentities(chapterReviews, trees)) StorageAdapter.setItem(chapter_reviews_key(), JSON.stringify(chapterReviews));
    smartCatalog = cachedPositionCatalog(trees, studyColor, tacticsCollection ? 'tactics-defenses-v1|' + pgn : pgn);
    let previousTrees = [];
    try { previousTrees = JSON.parse(await StorageAdapter.legacyTree(study_id + '_tree') || '[]'); } catch (_) {}
    if (!Array.isArray(previousTrees)) previousTrees = [];
    if (reconcileStudyProgress(chapterStats, trees, smartCatalog, chapterReviewSignatures, previousTrees, studyColor)) {
        await StorageAdapter.backup(chapter_stats_key());
        StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
    }
    window.addEventListener('study-progress-sync-merged', event => {
        if (event.detail.key === chapter_stats_key()) {
            chapterStats = JSON.parse(event.detail.value);
            bindChapterIdentities(chapterStats, trees);
            reconcileStudyProgress(chapterStats, practiceTrees, smartCatalog, chapterReviewSignatures, [], studyColor);
        } else if (event.detail.key === chapter_reviews_key()) {
            chapterReviews = readChapterReviews(event.detail.value);
            bindChapterIdentities(chapterReviews, trees);
        } else return;
        StorageAdapter.acceptSnapshot(event.detail.key, event.detail.value);
        studySessions.refresh();
        update_progress();
    });
    setup_chapter_select();
    sparring = setupStudySparring({ getChapters: () => trees, getTitle: () => document.querySelector('h1').textContent.trim(), getPlayer: () => studyColor,
        readStrength: () => StorageAdapter.getItem('sparring_strength'),
        writeStrength: level => StorageAdapter.setItem('sparring_strength', String(level)),
        readPreferences: () => ({ reviewEvery: StorageAdapter.getItem('sparring_review_every'), pauseOnBlunder: StorageAdapter.getItem('sparring_pause_blunder'), live: StorageAdapter.getItem('sparring_live_feedback') }),
        writePreferences: preferences => {
            StorageAdapter.setItem('sparring_review_every', String(preferences.reviewEvery));
            StorageAdapter.setItem('sparring_pause_blunder', String(preferences.pauseOnBlunder));
            StorageAdapter.setItem('sparring_live_feedback', String(preferences.live));
        },
        getBoard: () => ground,
        onBegin() {
            trainingSessionId += 1;
            contextReplayActive = false;
            finish_chapter_practice(false);
            stopWeakChapterRun(); stopSpacedReviewRun();
            window.dispatchEvent(new Event('study-puzzle-run-off'));
            failedPositionRun = null; updateFailedPositionsUi();
            readMode = false;
            if (tacticsCollection) window.trees = practiceTrees;
            update_read_mode_ui();
            overlay_manager.clear_overlays();
            studySessions.begin('sparring');
        },
        onPosition(position, routes, phase) {
            window.chess = position;
            const route = routes[0];
            window.curr_move = route ? [route.chapter, ...route.path] : [chapter];
            if (phase !== 'theory') publishStudyComments();
            if (phase === 'finished') studySessions.end();
            change_play_stockfish(); change_analysis_board(); studyMoveNavigation.update();
        },
        showHints(routes) {
            const original = curr_move;
            const shapes = new Map();
            try {
                for (const route of routes) {
                    window.curr_move = [route.chapter, ...route.path];
                    display_arrows(true);
                    for (const shape of ground.state.drawable.shapes) shapes.set(JSON.stringify(shape), shape);
                }
            } finally { window.curr_move = original; }
            if (routes.length > 1) overlay_manager.clear_overlays();
            ground.setShapes([...shapes.values()]);
            display_comments(true);
        },
        onDecision(result) { studySessions.decision('sparring', result.key, false, result.correct, result.assisted); },
        saveResult(result) {
            chapterStats.sparringSessions = { ...chapterStats.sparringSessions, [result.id]: result };
            StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats));
            studySessions.refresh();
        },
        getHistory: () => Object.values(chapterStats.sparringSessions || {})
    });
    const editChapter = document.getElementById('edit_chapter');
    if (editChapter) {
        const updateEditorLink = () => {
            const url = new URL(editChapter.href);
            url.searchParams.set('chapter_index', trees[chapter].sourceIndex);
            editChapter.href = url.toString();
        };
        document.getElementById('chapter_select').addEventListener('change', updateEditorLink);
        updateEditorLink();
    }
    const getCurrentChapter = () => chapterPgns[trees[chapter].sourceIndex] ? {
        pgn: chapterPgns[trees[chapter].sourceIndex],
        chapterIndex: Number(chapter),
        title: tree_chapter_name(Number(chapter)),
        study: document.querySelector('h1').textContent.trim(),
        studyPath: window.location.pathname
    } : null;
    studyFeatureViews = [
        setupStudyCollections({ getCurrentChapter }),
        setupStudyNavigation({ getCurrentChapter, goBack: go_back, goForward: go_forward, progressLabels: { unpracticed: i18n.progress_not_practiced, practiced: i18n.progress_practiced_moves, needsPractice: i18n.progress_needs_practice, reviewDue: i18n.spaced_review_due } })
    ];
    const gamePractice = new URLSearchParams(window.location.search);
    const hasGamePosition = gamePractice.has('practice_fen') && gamePractice.has('practice_expected');
    const linkedChapter = chapterFromUrl(window.location.search, trees.map((_, index) => tree_chapter_name(index)));
    const directedPractice = gamePractice.has('practice_fen') || gamePractice.has('practice');
    const savedActivity = requestedStudyActivity(window.location.search) || readStudyActivity(study_id);
    const activity = directedPractice ? null : tacticsCollection && !['read', 'lines'].includes(savedActivity) ? 'lines' : savedActivity;
    const puzzleRun = setupPuzzleRun(i18n, {
        initialMode: hasGamePosition || gamePractice.get('practice') === 'chapter' && linkedChapter !== null ? 'off'
            : activity === 'smart' ? 'smart' : activity ? localStorage.getItem('fullLineRunMode') || 'off' : undefined
    });
    studySessions = setupStudySessions({ getStats: () => chapterStats,
        persist: () => StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats)),
        storage: StorageAdapter, labels: i18n.session_labels,
        onContinue: updateSmartRun,
        onFinish: () => document.getElementById('stop_smart_run').click()
    });
    bindStudyPreferences(document.getElementById('settings_panel_general'), preferences, name => {
        if (name === 'arrows' || name === 'arrowType') display_arrows(false);
        if (name === 'arrows' || name === 'arrowType' || name === 'comments') display_comments(false);
    });
    practiceDepthView = bindStudyDepth(document.getElementById('study_depth_settings'), practiceDepth, practiceDepthChanged);
    practiceDepthView.refresh(chapter, get_repertoire_depth());
    setup_move_handler(handle_move);
    setup_click_handler(handle_click);

    visualization = setupStudyVisualization({
        storage: StorageAdapter, getStats: () => chapterStats,
        persist: () => StorageAdapter.setItem(chapter_stats_key(), JSON.stringify(chapterStats)),
        assist: () => assistedPositions.add(currentPositionId()), refresh: setup_move
    });

    window.total_moves = 0;

    resize_ground();


    start_training();
    studyMoveNavigation = setupStudyMoveNavigation({
        goBack: go_back,
        goForward: go_forward,
        getState: () => sparring?.active ? sparring.navigation() : ({
            canGoBack: !currentTacticsTrap() && !contextReplayActive && !failedPositionRun && !spacedReviewRunActive && !smartSession && curr_move.length > 1,
            canGoForward: !currentTacticsTrap() && !contextReplayActive && !failedPositionRun && !spacedReviewRunActive && !smartSession && tree_children(curr_move).length > 0
        })
    });
    if (hasGamePosition) {
        const target = gameLineTarget(scopedPracticeCatalog(), gamePractice.get('practice_fen'), gamePractice.get('practice_expected'), Number(chapter));
        if (target) {
            puzzleRun.setMode('smart', { persist: false, notify: false });
            updateSmartRun(target);
        } else {
            set_text(info_div, 'This position is outside the current practice scope. Check Max depth or sync your games after editing the study.');
        }
    } else if (!['read', 'sparring'].includes(activity) && (window.studyPuzzleRunMode ?? localStorage.getItem('puzzleRunMode')) === 'smart') updateSmartRun();
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
        const container = document.getElementById(readMode ? 'study_moves_heading' : 'study_board_actions');
        if (navigation.parentElement !== container) container.appendChild(navigation);
        resize_ground();
        overlay_manager.on_resize();
    });
    update_progress();
    setup_progress_modal();
    setup_progress_reset();
    const saveActivity = trackStudyActivity(study_id);
    if (activity === 'read') set_read_mode(true);
    else if (activity === 'sparring') document.getElementById('practice_sparring')?.click();
    else if (!directedPractice) saveActivity(window.studyPuzzleRunMode === 'smart' ? 'smart' : 'lines');
    if (requestedStudyActivity(window.location.search)) {
        const url = new URL(window.location.href);
        url.searchParams.delete('mode');
        window.history.replaceState(window.history.state, '', url);
    }
    void refreshGameEvidence(gamePositionsRequest);
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
    visualization?.reveal();
    finish_chapter_practice(false);
    trainingSessionId += 1;
    lineEligibleForReview = false;
    clear_all_text();
    setup_move();
}

function go_back() {
    if (sparring?.active) { sparring.back(); return; }
    if (currentTacticsTrap() || contextReplayActive || failedPositionRun || spacedReviewRunActive || smartSession || curr_move.length <= 1) return;
    chess.undo();
    curr_move.pop();
    refresh_manual_navigation();
}

function go_forward() {
    if (sparring?.active) { sparring.forward(); return; }
    if (currentTacticsTrap() || contextReplayActive || failedPositionRun || spacedReviewRunActive || smartSession) return;
    const nextNode = tree_children(curr_move)[0];
    if (!nextNode) return;
    play_move(nextNode.move);
    refresh_manual_navigation();
}
