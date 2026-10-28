import { incrementAchievementCounter } from '../../modules/achievement_progress.js';
import { createTrainingLifecycle } from '../../modules/training/training_lifecycle.js';
import { createLatestTask } from '../../modules/latest_task.js';
import { createBoardGame } from '../../modules/board/board_game.js';
import { playMoveSound } from '../../modules/sounds.js';
import { moveToUci } from '../../modules/board/chess_moves.js';
import { engineLine } from '../../modules/engine/engine_line.js';
import { moveArrows } from '../../modules/board/board_shapes.js';
import { restoreBoardPosition, setBoardInteraction } from '../../modules/board/board_interaction.js';
require('regenerator-runtime/runtime');
const Chess = require('chess.js');
import { turn_color, setup_chess } from '../../modules/board/chess_utils.js';
import { createEndgameEngine } from '../../modules/engine/endgame_engine.js';
import { createEndgameFeedback, endgameMateCue, endgameAssessmentCertain } from '../../modules/training/endgame_feedback.js';
import { renderEvaluationBar } from '../../components/evaluation_bar.js';
import { setupStudyFeedback } from '../../components/study_feedback.js';
import { createPromotionController } from '../../modules/board/promotion_controller.js';
import { setupStudyMoveTree } from '../../modules/study/study_move_tree.js';
import { onresize, resize_ground, setup_ground, setup_move_handler } from '../../modules/board/ground.js';
import { set_text, clear_all_text, error_div, info_div } from '../../modules/info_boxes.js';

const workspace = document.querySelector('.endgame-workspace');
const labels = JSON.parse(workspace.dataset.feedbackLabels);
const panel = document.getElementById('endgame_review');
const toggle = document.getElementById('endgame_live_feedback');
const evaluationToggle = document.getElementById('endgame_eval_toggle');
const finishButton = document.getElementById('endgame_finish');
let engine, feedback, picker, gameId = 0, ended = false, reviewing = false, busy = false;
let opponentTasks, reviewTasks, hintTasks;
let startFen, moves = [], pendingReply, selectedRow, reviewRoot, reviewState, reviewAnalysis;
const boardGame = createBoardGame({ getPosition: () => chess, getBoard: () => ground,
    getOptions: () => ({ color, playable: false }), onMove: playMoveSound });
const state = () => ({ initialFen: startFen, moves: moves.map(moveToUci), fen: chess.fen(), turn: chess.turn() });
const lifecycle = createTrainingLifecycle({ restore: () => main() });

function updateFen(value = chess.fen()) {
    document.getElementById('display_fen').value = value;
    document.getElementById('lichess_analysis').href = 'https://lichess.org/analysis/' + value;
}
function boardReady() {
    document.getElementById('endgame_undo').disabled = !feedback?.rows.length;
    document.getElementById('endgame_hint').disabled = ended || reviewing || busy || !!picker?.pending;
    setBoardInteraction(ground, chess, {
        playable: !ended && !reviewing && !busy && !picker?.pending && chess.turn() === (color === 'white' ? 'w' : 'b'), color
    });
}
function finish(success) {
    if (ended) return;
    ended = true;
    document.getElementById('todo').hidden = false;
    document.getElementById('todo').textContent = success ? i18n.success : i18n.error;
    document.getElementById('todo').dataset.result = success ? 'success' : 'retry';
    document.getElementById('next').classList.remove('hidden');
    finishButton.textContent = labels.review;
    boardReady();
    if (success) {
        try {
            const stored = JSON.parse(localStorage.getItem('solved_endgames') || '[]');
            const solved = new Set(Array.isArray(stored) ? stored : []);
            solved.add(id);
            localStorage.setItem('solved_endgames', JSON.stringify([...solved]));
            incrementAchievementCounter('achievements_endgames_solved');
        } catch (_) {}
    }
    openReview({ keepFinalPosition: true });
}
function goalReached(move) {
    return target_result === 'p' && move?.promotion && move.color === (color === 'white' ? 'w' : 'b') || target_result === 'w' && chess.in_checkmate() && chess.turn() !== (color === 'white' ? 'w' : 'b') || target_result === 'd' && chess.in_draw();
}
function checkEnd(move) {
    if (goalReached(move)) finish(true);
    else if (chess.game_over()) finish(false);
}
function playMove(move) {
    let played;
    try { played = boardGame.play(move); } catch (_) { return null; }
    if (!played) return null;
    hintTasks.cancel();
    moves.push(played);
    finishButton.disabled = false;
    ground.setAutoShapes([]);
    updateFen();
    feedback?.observe(state());
    return played;
}
function applyReply(reply) {
    pendingReply = null;
    const played = playMove(reply);
    if (!played) { set_text(error_div, labels.engineError); boardReady(); return; }
    checkEnd(played); boardReady();
}
async function opponentMove() {
    if (!lifecycle.run.active || ended || reviewing || busy || chess.turn() === (color === 'white' ? 'w' : 'b')) return;
    const task = opponentTasks.start();
    if (!task) return;
    busy = true; boardReady();
    document.getElementById('endgame_engine_status').textContent = labels.thinking;
    try {
        const reply = await engine.bestMove(state());
        if (!task.isCurrent()) return;
        busy = false;
        if (reviewing) pendingReply = reply;
        else applyReply(reply);
    } catch (_) {
        if (!task.isCurrent()) return;
        busy = false; set_text(error_div, labels.engineError);
    } finally {
        if (task.isCurrent()) { document.getElementById('endgame_engine_status').textContent = ''; boardReady(); }
        task.finish();
    }
}
function playUserMove(from, to, promotion) {
    if (ended || reviewing || busy || chess.turn() !== (color === 'white' ? 'w' : 'b')) return;
    const before = state();
    const played = playMove({ from, to, promotion });
    if (!played) { restoreBoardPosition(ground, chess, { playable: false }); boardReady(); return; }
    const after = state();
    const terminal = chess.game_over() ? { turn: chess.turn(), depth: 99, score: { type: chess.in_checkmate() ? 'mate' : 'cp', value: 0 }, pv: [] } : null;
    feedback.record({ before, after, terminal, goalReached: Boolean(goalReached(played)), ply: moves.length, san: played.san, uci: moveToUci(played) });
    checkEnd(played); boardReady();
    if (!ended) opponentMove();
}
function handleMove(from, to) {
    if (!picker.request({ from, to, legal: chess.moves({ verbose: true }), color, orientation: color })) {
        playUserMove(from, to);
    }
}
function continuation(row) {
    if (!row?.beforeAnalysis?.pv?.length) return '';
    return engineLine(row.before.fen, row.beforeAnalysis.pv, 5);
}
function selectReview(path) {
    hintTasks.cancel();
    const ply = path.length;
    selectedRow = feedback.rows.find(row => row.ply === ply) || null;
    const position = new Chess(startFen);
    for (const move of moves.slice(0, selectedRow ? ply - 1 : ply)) position.move(move);
    const suggestion = selectedRow?.beforeAnalysis?.uci;
    restoreBoardPosition(ground, position, { playable: false, lastMove: null });
    ground.setAutoShapes(moveArrows([suggestion], 'pgn_green'));
    updateFen(position.fen());
    reviewState = { initialFen: startFen, moves: moves.slice(0, selectedRow ? ply - 1 : ply).map(moveToUci), fen: position.fen(), turn: position.turn() };
    reviewAnalysis = selectedRow?.beforeAnalysis || null;
    refreshReviewEvaluation();
    moveTree.update({ root: reviewRoot, fen: startFen, chapter: gameId, path, reading: true });
    renderComment();
}
function renderComment() {
    const row = selectedRow;
    document.getElementById('endgame_review_comment').textContent = row ? labels.before.replace('{move}', row.san) + (row.status === 'done' ? row.moment ? ' ' + labels[row.moment] : !endgameAssessmentCertain(row) ? ' ' + labels.uncertain : '' : ' ' + labels[row.status === 'error' ? 'unavailable' : 'analysing']) : labels.select;
    const suggestion = row?.beforeAnalysis?.uci;
    if (reviewing) ground.setAutoShapes(moveArrows([suggestion], 'pgn_green'));
    const line = continuation(row);
    document.getElementById('endgame_review_line').textContent = line ? labels.suggestion + ' ' + line : '';
    document.getElementById('endgame_retry').disabled = !row;
    renderEvaluation();
}
function renderEvaluation() {
    const bar = document.getElementById('endgame_eval_bar');
    bar.hidden = !evaluationToggle.checked;
    const layout = document.querySelector('.endgame-board-layout');
    const changed = layout.classList.contains('has-evaluation') !== evaluationToggle.checked;
    layout.classList.toggle('has-evaluation', evaluationToggle.checked);
    if (changed && window.ground) resize_ground();
    let analysis = reviewing ? reviewAnalysis || selectedRow?.beforeAnalysis : feedback?.currentAnalysis;
    if ((!reviewing || reviewState?.fen === chess.fen()) && chess.game_over()) analysis = { turn: chess.turn(), score: { type: chess.in_checkmate() ? 'mate' : 'cp', value: 0 } };
    renderEvaluationBar(bar, analysis, color, labels);
    lifecycle.page.frame(sizeEvaluationBar);
}
function sizeEvaluationBar() {
    const board = document.querySelector('#chessground cg-board');
    if (board) document.getElementById('endgame_eval_bar').style.height = board.getBoundingClientRect().height + 'px';
}
async function refreshReviewEvaluation() {
    reviewTasks.cancel();
    if (!reviewing || !evaluationToggle.checked || !reviewState) return;
    const expected = reviewState, task = reviewTasks.start();
    if (!task) return;
    try {
        const result = await feedback.hint(expected);
        if (!task.isCurrent() || !reviewing || reviewState !== expected) return;
        reviewAnalysis = result;
        renderEvaluation();
    } catch (_) {}
    finally { task.finish(); }
}
const gradeSymbols = { best: '★', acceptable: '✓', inaccuracy: '?!', mistake: '?', blunder: '??' };
function renderLiveAssessment() {
    const button = document.getElementById('endgame_live_assessment');
    const row = [...(feedback?.rows || [])].reverse().find(row => row.status === 'done');
    button.hidden = !toggle.checked || reviewing || !row;
    const comment = document.getElementById('endgame_live_comment');
    comment.hidden = button.hidden || !row?.moment;
    comment.textContent = !comment.hidden ? labels[row.moment] : '';
    const cue = document.getElementById('endgame_mate_cue');
    const mate = endgameMateCue(feedback?.currentAnalysis, color === 'white' ? 'w' : 'b');
    cue.hidden = !toggle.checked || reviewing || !mate;
    if (!cue.hidden) {
        cue.dataset.winning = String(mate.winning);
        cue.textContent = labels[mate.winning ? 'mate' : 'mateAgainst'].replace('{moves}', mate.moves);
    }
    if (button.hidden) return;
    const grade = endgameAssessmentCertain(row) ? row.assessment?.grade : null;
    button.textContent = (gradeSymbols[grade] || '…') + ' ' + row.san + ' · ' + labels[grade || 'uncertain'];
    button.dataset.grade = grade || '';
    button.title = row.moment ? labels[row.moment] : labels.review;
    button.onclick = () => { openReview(); selectReview(Array(row.ply).fill(0)); };
}
function updateFeedback() { renderLiveAssessment(); renderReview(); renderEvaluation(); }
function renderReview() {
    if (!reviewing) return;
    const summary = feedback.summary();
    document.getElementById('endgame_review_status').textContent = labels.coverage.replace('{done}', summary.done).replace('{total}', feedback.rows.length) + ' · ' + labels.moments.replace('{count}', summary.moments) + (summary.pending ? ' · ' + labels.analysing : summary.failed ? ' · ' + labels.unavailable : '');
    const buttons = [...document.querySelectorAll('#endgame_review_moves .study-tree-move')];
    feedback.rows.forEach(row => {
        const button = buttons[row.ply];
        if (!button) return;
        const grade = row.status === 'done' && endgameAssessmentCertain(row) ? row.assessment?.grade : null;
        button.classList.toggle('endgame-key-move', Boolean(row.moment));
        button.dataset.grade = grade || '';
        button.dataset.gradeSymbol = gradeSymbols[grade] || '';
        button.setAttribute('title', row.moment ? labels[row.moment] : grade ? labels[grade] : labels[row.status === 'error' ? 'unavailable' : row.status === 'done' ? 'uncertain' : 'analysing']);
        button.setAttribute('aria-label', (button.dataset.movePrefix || '') + ' ' + row.san + (grade ? ' · ' + labels[grade] : ''));
    });
    renderComment();
}
const moveTree = setupStudyMoveTree({ element: document.getElementById('endgame_review_moves'), onSelect: selectReview, startLabel: labels.start, variationLabel: '' });
lifecycle.page.use(moveTree);
function openReview({ keepFinalPosition = false } = {}) {
    if (!moves.length) return;
    hintTasks.cancel();
    reviewing = true; clear_all_text(); picker.close(); boardReady();
    finishButton.disabled = true;
    finishButton.textContent = labels.review;
    document.getElementById('endgame_resume').hidden = ended;
    let children = [];
    for (const move of [...moves].reverse()) children = [{ move: move.san, children }];
    reviewRoot = children;
    moveTree.update({ root: reviewRoot, fen: startFen, chapter: gameId, path: [], reading: true });
    feedback.review();
    if (keepFinalPosition) {
        selectedRow = null;
        reviewState = state(); reviewAnalysis = feedback.currentAnalysis;
        restoreBoardPosition(ground, chess, { playable: false });
        ground.setAutoShapes([]);
        moveTree.update({ root: reviewRoot, fen: startFen, chapter: gameId, path: Array(moves.length).fill(0), reading: true });
        updateFen(); renderComment();
    } else {
        const key = feedback.rows.find(row => row.moment) || feedback.rows[0];
        selectReview(Array(key?.ply || 0).fill(0));
    }
    renderLiveAssessment();
    renderEvaluation();
}
function resume() {
    reviewTasks.cancel();
    hintTasks.cancel();
    reviewing = false; feedback.close(); selectedRow = null; reviewState = null; reviewAnalysis = null;
    finishButton.disabled = false;
    finishButton.textContent = ended ? labels.review : labels.finish;
    renderLiveAssessment();
    ground.set({ fen: chess.fen(), lastMove: moves.length ? [moves[moves.length - 1].from, moves[moves.length - 1].to] : undefined });
    ground.setAutoShapes([]); updateFen(); boardReady();
    feedback.observe(state());
    if (pendingReply) applyReply(pendingReply);
    else opponentMove();
}
function main(position = fen, restored = null) {
    if (!lifecycle.page.active) return;
    const scope = lifecycle.reset();
    gameId++;
    startFen = position; moves = restored?.moves || []; pendingReply = null; selectedRow = null; reviewState = null; reviewAnalysis = null;
    ended = false; reviewing = false; busy = false; panel.hidden = true;
    document.getElementById('endgame_live_assessment').hidden = true;
    document.getElementById('endgame_mate_cue').hidden = true;
    clear_all_text();
    document.getElementById('endgame_eval_bar').dataset.hasEvaluation = 'false';
    setup_chess(startFen); window.color = turn_color(chess);
    for (const move of moves) chess.move(move);
    setup_ground(chess.fen());
    scope.use(ground);
    ground.setAutoShapes([]);
    resize_ground(); setup_move_handler(scope.guard(handleMove));
    engine = createEndgameEngine();
    scope.use(engine.dispose.bind(engine));
    opponentTasks = scope.use(createLatestTask());
    reviewTasks = scope.use(createLatestTask());
    hintTasks = scope.use(createLatestTask());
    feedback = createEndgameFeedback({ engine, player: chess.turn(), target: target_result, toggle, evaluationToggle, panel, labels, onUpdate: updateFeedback, saved: restored?.feedback });
    scope.use(feedback);
    const evaluationChange = evaluationToggle.onchange;
    evaluationToggle.onchange = () => { evaluationChange(); refreshReviewEvaluation(); };
    picker = scope.use(createPromotionController({ element: document.querySelector('[data-promotion-picker]'),
        onOpen: () => { restoreBoardPosition(ground, chess, { playable: false }); },
        onChoose: (promotion, move) => { boardReady(); playUserMove(move.from, move.to, promotion); },
        onCancel: () => { restoreBoardPosition(ground, chess, { playable: false }); boardReady(); } }));
    document.getElementById('todo').hidden = false;
    delete document.getElementById('todo').dataset.result;
    document.getElementById('todo').textContent = labels[color === 'white' ? 'white' : 'black'] + ' · ' + labels[target_result === 'w' ? 'win' : target_result === 'd' ? 'draw' : 'promote'];
    document.getElementById('next').classList.add('hidden');
    document.getElementById('endgame_engine_status').textContent = '';
    finishButton.textContent = labels.finish;
    finishButton.disabled = !moves.length;
    boardReady(); updateFen();
    feedback.observe(state());
}
lifecycle.page.use(setupStudyFeedback());
lifecycle.page.assign(document.getElementById('reset'), 'onclick', () => main());
lifecycle.page.assign(document.getElementById('endgame_undo'), 'onclick', () => {
    const lastDecision = feedback.rows[feedback.rows.length - 1];
    if (!lastDecision) return;
    const retained = moves.slice(0, lastDecision.ply - 1);
    const saved = feedback.snapshot(retained.length);
    main(startFen, { moves: retained, feedback: saved });
    const last = retained[retained.length - 1];
    ground.set({ fen: chess.fen(), lastMove: last ? [last.from, last.to] : undefined });
    finishButton.disabled = !moves.length;
    updateFen(); boardReady(); feedback.observe(state());
});
lifecycle.page.assign(finishButton, 'onclick', openReview);
async function showHint() {
    if (!lifecycle.run.active || ended || reviewing || busy || picker?.pending) return;
    const task = hintTasks.start(), before = state();
    if (!task) return;
    try {
        const result = await feedback.hint(before);
        if (!task.isCurrent() || reviewing || ended || chess.fen() !== before.fen) return;
        const suggestion = continuation({ before, beforeAnalysis: result });
        ground.setAutoShapes(moveArrows([result.uci], 'pgn_green'));
        set_text(info_div, labels.suggestion + ' ' + suggestion, { transient: true });
    } catch (_) { if (task.isCurrent()) set_text(error_div, labels.unavailable, { transient: true }); }
    finally { task.finish(); }
}
lifecycle.page.assign(document.getElementById('endgame_hint'), 'onclick', showHint);
lifecycle.page.assign(document.getElementById('endgame_resume'), 'onclick', resume);
lifecycle.page.assign(document.getElementById('endgame_retry'), 'onclick', () => { if (selectedRow) main(selectedRow.before.fen); });
lifecycle.page.assign(document.getElementById('display_fen'), 'onclick', event => event.target.select());
lifecycle.page.assign(document.getElementById('copy_fen'), 'onclick', async () => { const input = document.getElementById('display_fen'); input.select(); try { await navigator.clipboard.writeText(input.value); } catch (_) { document.execCommand('copy'); } });
lifecycle.page.listen(window, 'resize', onresize);
const evaluationResize = new ResizeObserver(() => lifecycle.page.frame(sizeEvaluationBar));
evaluationResize.observe(document.querySelector('.study-board-frame'));
lifecycle.page.use(() => evaluationResize.disconnect());
lifecycle.page.assign(window, 'main', main);
main();
