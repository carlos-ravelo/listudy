const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('@babel/parser');
const chessModule = require('chess.js');
const Chess = chessModule.Chess || chessModule;
const statsContext = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/chapter_stats.js'), 'utf8')
    .replace(/export \{[^}]+\};/, ''), statsContext);
const moveTreeContext = vm.createContext({ require });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/study_move_tree.js'), 'utf8')
    .replace(/^export /gm, ''), moveTreeContext);

vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/position_context.js'), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, ''), moveTreeContext);
const source = fs.readFileSync(path.join(__dirname, '../../js/study.js'), 'utf8');
const reviewContext = vm.createContext({ ...require('ts-fsrs'), ChessModule: chessModule });
for (const file of ['review_history.js', 'position_review.js', 'failed_positions.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study', file), 'utf8').replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, ''), reviewContext);
const names = new Set([
    'currentPositionId', 'currentFailures', 'presentPracticePosition', 'replayContextFromStart',
    'handle_move', 'play_move', 'setup_move', 'change_analysis_board',
    'change_play_stockfish', 'refresh_manual_navigation', 'go_back', 'go_forward',
    'update_read_mode_ui', 'set_read_mode', 'play_read_move', 'seek_read_move',
    'finish_chapter_practice', 'chapter_stats_key'
]);
const declarations = parser.parse(source, { sourceType: 'module' }).program.body;
const functions = declarations
    .filter(node => node.type === 'FunctionDeclaration' && names.has(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n');

// Existing depth preferences stay inactive until explicitly enabled for a chapter.
const depthStorage = { depth_0: '2' };
const depthNodes = Object.fromEntries(['max_depth_container', 'max_depth_label', 'max_depth_range',
    'max_depth_sub', 'max_depth_add', 'limit_practice_depth'].map(id => [id, {
    classList: { toggle() {} }
}]));
const depthContext = vm.createContext({
    chapter: 0, max_depth_key_base: 'depth_', DEPTH_MAX: -1, depth_limit_enabled: false,
    document: { getElementById: id => depthNodes[id] },
    get_repertoire_depth: () => 5,
    practiceDepthChanged() {},
    get_option_from_localstorage: (key, fallback) => depthStorage[key] === undefined ? fallback : Number(depthStorage[key]),
    StorageAdapter: { getItem: key => depthStorage[key], setItem: (key, value) => depthStorage[key] = String(value) }
});
vm.runInContext(declarations.filter(node => node.type === 'FunctionDeclaration' &&
    ['update_max_depth_label', 'set_options_values_for_max_depth', 'inc_or_dec_max_depth'].includes(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n'), depthContext);
depthContext.set_options_values_for_max_depth();
assert.equal(depthContext.depth_limit_enabled, false);
assert.equal(depthNodes.max_depth_range.disabled, true);
depthStorage.depth_0_enabled = 'true';
depthContext.set_options_values_for_max_depth();
assert.equal(depthContext.max_depth, 2);
assert.equal(depthNodes.max_depth_range.disabled, false);
depthContext.inc_or_dec_max_depth(1);
assert.equal(depthStorage.depth_0, '3');
depthContext.chapter = 1;
depthContext.set_options_values_for_max_depth();
assert.equal(depthContext.depth_limit_enabled, false);
assert.equal(depthContext.max_depth, -1);
depthContext.chapter = 0;
depthContext.set_options_values_for_max_depth();
assert.equal(depthContext.depth_limit_enabled, true);
assert.equal(depthContext.max_depth, 3);

function fixture(moves, fen, orientation = 'white') {
    const root = moves.reduceRight((children, move, move_index) => [{ move, move_index, children }], []);
    const links = {
        analysis_board: { href: 'https://lichess.org/analysis' },
        play_stockfish: { href: '/play-stockfish' }
    };
    const board = { orientation };
    const waits = [];
    const timers = [];
    const context = vm.createContext({
        chess: new Chess(fen), chapter: 0, curr_move: [0],
        trees: [{ root, headers: fen ? { SetUp: '1', FEN: fen } : {} }],
        trainingSessionId: 0, lineEligibleForReview: true, lineReviewRecorded: false,
        chapterStats: { version: 1, chapters: {} }, practiceChapter: null,
        chapterReviewSignatures: ['chapter'], study_id: 'study',
        beginChapterPractice: statsContext.beginChapterPractice,
        finishChapterPractice: statsContext.finishChapterPractice,
        StorageAdapter: { setItem() {} },
        contextReplayActive: false, updateContextReplayUi() {}, comments_div: 'comments',
        replayPositionContext: moveTreeContext.replayPositionContext,
        smartSession: null, smartTarget: null, failedPositionRun: null,
        positionAttempts: new Set(), assistedPositions: new Set(), NEW_POSITION_LIMIT: 10,
        positionReviews: reviewContext.positionReviews, recordPositionReview: reviewContext.recordPositionReview,
        introducedMoves: reviewContext.introducedMoves, recordIntroducedMove: reviewContext.recordIntroducedMove,
        recordContinuationReview: reviewContext.recordContinuationReview,
        chapterFailures: reviewContext.chapterFailures, recordPositionResult: reviewContext.recordPositionResult,
        updateFailedPositionsUi() {}, selectNextSmartPosition: () => context.advances++,
        spacedReviewRunActive: false, weakChapterRunActive: false, readMode: false,
        total_moves: 0, combo_count: 0, attempts: 0, reviews: 0, resets: 0, advances: 0,
        max_depth: 100, DEPTH_MAX: 100, depth_limit_enabled: false, board_review: 'slow',
        i18n: { review_slow: 'slow', key_move_enabled: 'enabled' }, success_div: {}, error_div: {}, info_div: {},
        ground: { state: board, set: state => Object.assign(board, state), setShapes() {}, redrawAll() {} },
        ground_move() {}, ground_undo_last_move() {},
        studyMoveNavigation: { update() {} },
        studyMoveTree: { update() {} },
        readChapterPosition: moveTreeContext.readChapterPosition,
        overlay_manager: { mark_current_overlays_seen() {}, clear_overlays() {} },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        Event: class { constructor(type) { this.type = type; } },
        dispatchEvent: event => { context.lastEvent = event; },
        document: { getElementById: id => links[id] || { click: () => context.advances++ } },
        localStorage: { getItem: () => context.puzzleMode || 'off' },
        turn_color: chess => chess.turn() === 'w' ? 'white' : 'black',
        uci_to_san: (chess, from, to) => {
            const move = chess.move({ from, to });
            chess.undo();
            return move.san;
        },
        tree_possible_moves: access => access.slice(1).reduce((nodes, index) => nodes[index].children, root),
        tree_children: access => context.tree_possible_moves(access),
        tree_get_node: access => access.slice(1).reduce((parent, index) => parent.children[index], { children: root }),
        tree_get_node_depth: node => 1 + Math.floor(node.move_index / 2),
        tree_move_index: (access, san) => context.tree_possible_moves(access).findIndex(node => node.move === san),
        ai_move: access => context.tree_possible_moves(access)[0]?.move,
        ground_set_moves: () => { board.legalMoves = context.chess.moves(); },
        possible_promotion: () => '', update_value() {}, store_trees() {}, update_progress() {},
        record_chapter_attempt: (correct, moveId, positionId, assisted) => {
            context.attempts++;
            statsContext.recordChapterAttempt(context.chapterStats, context.chapter, correct, moveId, positionId, assisted);
        },
        record_line_review: () => { context.reviews++; context.lineReviewRecorded = true; },
        display_arrows() {}, display_comments() {}, show_suggestions() {}, clear_all_text() {},
        set_text() {}, right_move_text: () => '', achievement_end_of_line() {},
        get_move_delay: () => 0,
        sleep: () => new Promise(resolve => waits.push(resolve)),
        setTimeout: callback => timers.push(callback),
        start_training: () => context.resets++,
        selectNextDueChapter: () => context.advances++,
        selectNextWeakChapter: () => context.advances++,
        stopWeakChapterRun: () => { context.weakChapterRunActive = false; },
        stopSpacedReviewRun: () => { context.spacedReviewRunActive = false; },
        color: orientation, key_moves_mode: 'disabled', mode_free: 'free',
        setup_chess: fen => { context.chess = new Chess(fen); },
        ground_init_state: (fen, orientation) => Object.assign(board, { fen, orientation }),
        console
    });
    context.window = context;
    vm.runInContext(functions, context);
    context.setup_move();
    return { context, board, links, waits, timers };
}

function assertSynchronized({ context, board, links }) {
    const chess = context.chess;
    assert.equal(board.fen, chess.fen());
    assert.equal(board.turnColor, context.turn_color(chess));
    assert.equal(board.check, chess.in_check());
    assert.deepEqual(board.legalMoves, chess.moves());
    const last = chess.history({ verbose: true }).slice(-1)[0];
    assert.equal(JSON.stringify(board.lastMove), JSON.stringify(last ? [last.from, last.to] : undefined));
    assert.equal(links.play_stockfish.href, `/play-stockfish#${chess.fen()}`);
    assert.equal(links.analysis_board.href, context.trees[context.chapter].headers.SetUp
        ? `https://lichess.org/analysis/${chess.fen()}?color=${board.orientation}`
        : `https://lichess.org/analysis/pgn/${encodeURIComponent(chess.pgn())}?color=${board.orientation}`);
}

(async () => {
    for (const orientation of ['white', 'black']) {
        for (const reading of [false, true]) {
            for (const [moves, fen] of [
                [['e4', 'e5']],
                [['a8=Q+', 'Kd7'], '4k3/P7/8/8/8/8/8/4K3 w - - 0 1'],
                [['a1=Q+', 'Kd2'], '4k3/8/8/8/8/8/p7/4K3 b - - 0 1']
            ]) {
                const test = fixture(moves, fen, orientation);
                test.context.readMode = reading;
                assertSynchronized(test);
                for (const move of moves) {
                    test.context.play_move(move);
                    test.context.setup_move();
                    assertSynchronized(test);
                    assert.equal(new URL(test.links.analysis_board.href).searchParams.get('color'), orientation);
                }
                test.context.go_back();
                assertSynchronized(test);
            }
        }
    }

    const reading = fixture(['e4', 'e5', 'Nf3']);
    const { context: reader } = reading;
    const install = name => {
        const node = declarations.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
        vm.runInContext(source.slice(node.start, node.end), reader);
    };
    install('start_training');
    reader.color = 'black';
    reader.trees[0].first_variation = null;
    reader.weakChapterRunActive = true;
    reader.set_read_mode(true);
    assert.equal(reading.board.orientation, 'black');
    assertSynchronized(reading);
    assert.equal(reader.weakChapterRunActive, false);
    assert.equal(reader.chess.history().length, 0);
    assert.equal(reader.lineEligibleForReview, false);
    assert.equal(reader.lastEvent.detail.reading, true);
    await reader.handle_move('e2', 'e4');
    assert.deepEqual(reader.chess.history(), ['e4']);
    assert.equal(reading.waits.length, 0);
    assert.equal(reader.attempts, 0);
    assert.equal(reader.total_moves, 0);
    assert.equal(reader.reviews, 0);
    await reader.handle_move('c7', 'c5');
    assert.deepEqual(reader.chess.history(), ['e4']);
    assert.equal(reader.attempts, 0);
    assertSynchronized(reading);
    reader.tree_children([0, 0]).push({ move: 'c5', children: [] });
    reader.setup_move();
    assert.equal(JSON.stringify(reader.lastEvent.detail.moves), JSON.stringify(['e5', 'c5']));
    assert.equal(reader.play_read_move('c5'), true);
    assert.deepEqual(reader.chess.history(), ['e4', 'c5']);
    assertSynchronized(reading);
    reader.go_back();
    reader.go_forward();
    assert.deepEqual(reader.chess.history(), ['e4', 'e5']);
    assert.equal(reader.seek_read_move([0, 1]), true);
    assert.deepEqual(reader.chess.history(), ['e4', 'c5']);
    assertSynchronized(reading);
    assert.equal(reader.seek_read_move([0, 0, 0]), true);
    assert.deepEqual(reader.chess.history(), ['e4', 'e5', 'Nf3']);
    assertSynchronized(reading);
    const beforeInvalidPath = reader.chess.fen();
    assert.equal(reader.seek_read_move([0, 99]), false);
    assert.equal(reader.chess.fen(), beforeInvalidPath);
    assert.equal(reader.seek_read_move([]), true);
    assert.equal(reader.chess.history().length, 0);
    assert.equal(reader.attempts, 0);
    assert.equal(reader.reviews, 0);
    assertSynchronized(reading);

    reader.show_comments = 'hidden';
    reader.give_hints = () => false;
    reader.tree_get_node = () => ({ comments: [{ text: 'Chapter explanation' }] });
    reader.create_comment_list = (id, move) => { reader.renderedComment = move; };
    install('display_comments');
    reader.display_comments(false);
    assert.equal(reader.renderedComment.comments[0].text, 'Chapter explanation');
    reader.set_read_mode(false);
    assert.equal(reading.board.orientation, 'black');
    assertSynchronized(reading);
    assert.equal(reader.seek_read_move([]), false);
    assert.equal(reader.readMode, false);
    assert.equal(reader.lineEligibleForReview, true);
    assert.deepEqual(reader.chess.history(), ['e4']);
    assert.equal(reader.chapterStats.chapters[0].activePractice.attempts, 0);
    reader.set_read_mode(true);
    assert.equal(reader.chess.history().length, 0);
    assert.equal(reader.chapterStats.chapters[0].activePractice, undefined);
    reader.trees[0].headers = { SetUp: '1', FEN: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' };
    reader.start_training();
    assert.equal(reading.board.orientation, 'white');
    assertSynchronized(reading);
    assert.equal(reader.chess.fen(), reader.trees[0].headers.FEN);
    assert.equal(reader.attempts, 0);
    assert.equal(reader.reviews, 0);

    for (const [moves, fen] of [
        [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']],
        [['e4', 'a6', 'e5', 'd5', 'exd6']],
        [['a8=Q+'], '4k3/P7/8/8/8/8/8/4K3 w - - 0 1']
    ]) {
        const test = fixture(moves, fen);
        const { context } = test;
        context.go_back();
        assert.equal(context.trainingSessionId, 0);
        assert.equal(context.lineEligibleForReview, true);
        for (const move of moves) {
            context.go_forward();
            assert.equal(context.chess.history().slice(-1)[0], move);
            assertSynchronized(test);
        }
        const session = context.trainingSessionId;
        context.go_forward();
        assert.equal(context.trainingSessionId, session);
        for (const move of moves) {
            context.go_back();
            assertSynchronized(test);
        }
        assert.equal(context.attempts, 0);
        assert.equal(context.reviews, 0);
        context.spacedReviewRunActive = true;
        context.go_forward();
        assert.equal(context.chess.history().length, 0);
    }

    const fullLine = fixture(['e4', 'e5', 'Nf3']);
    fullLine.context.studyFullLines = true;
    fullLine.context.max_depth = 1;
    const fullMove = fullLine.context.handle_move('e2', 'e4');
    fullLine.waits.shift()();
    await fullMove;
    assert.equal(fullLine.context.chess.history().join(' '), 'e4 e5');
    assert.equal(fullLine.context.resets, 0);

    const limitedLine = fixture(['e4', 'e5', 'Nf3']);
    limitedLine.context.studyFullLines = true;
    limitedLine.context.depth_limit_enabled = true;
    limitedLine.context.max_depth = 1;
    limitedLine.context.board_review = 'fast';
    limitedLine.context.practiceChapter = 0;
    statsContext.beginChapterPractice(limitedLine.context.chapterStats, 0, 'chapter');
    const limitedMove = limitedLine.context.handle_move('e2', 'e4');
    limitedLine.waits.shift()();
    await limitedMove;
    assert.equal(limitedLine.context.chess.history().join(' '), 'e4');
    assert.equal(limitedLine.context.resets, 1);
    assert.equal(limitedLine.context.reviews, 0);
    assert.equal(limitedLine.context.chapterStats.chapters[0].lastPractice.completed, false);

    const dueLine = fixture(['e4', 'e5', 'Nf3']);
    dueLine.context.studyFullLines = true;
    dueLine.context.spacedReviewRunActive = true;
    dueLine.context.depth_limit_enabled = true;
    dueLine.context.max_depth = 1;
    const dueMove = dueLine.context.handle_move('e2', 'e4');
    dueLine.waits.shift()();
    await dueMove;
    assert.equal(dueLine.context.chess.history().join(' '), 'e4 e5');
    assert.equal(dueLine.context.resets, 0);

    const reply = fixture(['e4', 'e5', 'Nf3']);
    const pendingReply = reply.context.handle_move('e2', 'e4');
    assert(reply.links.analysis_board.href.includes(encodeURIComponent('1. e4')));
    reply.context.go_back();
    reply.waits.shift()();
    await pendingReply;
    assert.equal(reply.context.chess.history().length, 0);
    assert.equal(reply.context.attempts, 1);
    assert.equal(reply.context.reviews, 0);
    assertSynchronized(reply);

    const reset = fixture(['e4']);
    const pendingReset = reset.context.handle_move('e2', 'e4');
    reset.waits.shift()();
    await new Promise(setImmediate);
    assert.equal(reset.waits.length, 1);
    reset.context.go_back();
    reset.waits.shift()();
    await pendingReset;
    assert.equal(reset.context.resets, 0);
    assertSynchronized(reset);

    const missed = fixture(['e4']);
    missed.context.beginChapterPractice(missed.context.chapterStats, 0, 'chapter');
    missed.context.practiceChapter = 0;
    missed.context.puzzleMode = 'next';
    await missed.context.handle_move('d2', 'd4');
    await missed.context.handle_move('g1', 'f3');
    const corrected = missed.context.handle_move('e2', 'e4');
    missed.waits.shift()();
    await corrected;
    const practice = missed.context.chapterStats.chapters[0].lastPractice;
    assert.equal(practice.completed, true);
    assert.equal(practice.testedMoves, 1);
    assert.equal(practice.missedMoves, 1);
    assert.equal(practice.errors, 2);
    assert.equal(statsContext.recentPracticePerformance(missed.context.chapterStats, 0, 'chapter').accuracy, 0);

    const advance = fixture(['e4']);
    advance.context.puzzleMode = 'next';
    const pendingAdvance = advance.context.handle_move('e2', 'e4');
    advance.waits.shift()();
    await pendingAdvance;
    assert.equal(advance.timers.length, 1);
    advance.context.go_back();
    advance.timers.shift()();
    assert.equal(advance.context.advances, 0);
    assertSynchronized(advance);
    const smart = fixture(['e4']);
    smart.context.smartSession = { newCount: 0 };
    smart.context.smartTarget = { type: 'position' };
    await smart.context.handle_move('d2', 'd4');
    const smartCards = smart.context.chapterStats.chapters[0].positionReviews.cards;
    assert.equal(smartCards[''].recovered, false);
    assert.equal(smart.context.smartSession.newCount, 0);
    assert.equal(smart.context.smartSession.reviewCount, 1);
    const correction = smart.context.handle_move('e2', 'e4');
    smart.waits.shift()();
    await correction;
    assert.equal(smartCards[''].recovered, false);
    assert.equal(smart.context.advances, 1);
    assert.equal(smart.context.chapterStats.chapters[0].cleanMoves.length, 0);
    assert.equal(smart.context.smartTarget, null);
    const attemptsBefore = smart.context.attempts;
    await smart.context.handle_move('e2', 'e4');
    assert.equal(smart.context.attempts, attemptsBefore);
    const replay = fixture(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    replay.context.smartSession = { newCount: 0 };
    replay.context.smartTarget = { type: 'position' };
    replay.context.positionAttempts.add('previous');
    replay.context.assistedPositions.add('hinted');
    const replaying = replay.context.presentPracticePosition([0, 0, 0, 0], 4);
    assert.equal(replay.context.contextReplayActive, true);
    await replay.context.handle_move('e2', 'e4');
    assert.equal(replay.context.attempts, 0);
    for (let index = 0; index < 5; index++) {
        assert.equal(replay.waits.length, 1);
        replay.waits.shift()();
        await new Promise(setImmediate);
    }
    await replaying;
    assert.equal(replay.context.contextReplayActive, false);
    assert.equal(replay.context.chess.history().join(' '), 'e4 e5 Nf3 Nc6');
    assert.equal(replay.context.curr_move.join(','), '0,0,0,0,0');
    assert.equal(replay.context.attempts, 0);
    assert.equal(replay.context.reviews, 0);
    assert.equal(replay.context.positionAttempts.has('previous'), true);
    assert.equal(replay.context.assistedPositions.has('hinted'), true);
    assertSynchronized(replay);
    const canceled = fixture(['e4', 'e5', 'Nf3']);
    const pendingContext = canceled.context.presentPracticePosition([0, 0], 4);
    canceled.context.trainingSessionId++;
    canceled.context.contextReplayActive = false;
    canceled.context.chess = new Chess();
    canceled.waits.shift()();
    await pendingContext;
    assert.equal(canceled.context.chess.history().length, 0);
    assert.equal(canceled.context.contextReplayActive, false);
    const chainPractice = fixture(['e4', 'e5', 'Nf3']);
    chainPractice.context.depth_limit_enabled = true;
    chainPractice.context.max_depth = 1;
    chainPractice.context.smartSession = { newCount: 0, reviewCount: 0, reviewStreak: 0 };
    chainPractice.context.smartTarget = { type: 'line', chapter: 0, path: [], route: [0] };
    const aiDeclaration = declarations.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'ai_move');
    vm.runInContext(source.slice(aiDeclaration.start, aiDeclaration.end), chainPractice.context);
    const chainAttempt = chainPractice.context.handle_move('e2', 'e4');
    chainPractice.waits.shift()();
    await chainAttempt;
    assert.equal(chainPractice.context.chess.history().join(' '), 'e4');
    assert.equal(chainPractice.context.smartSession.newCount, 1);
    assert.equal(chainPractice.timers.length, 1);
    assert.equal(chainPractice.context.reviews, 0);
    assert.equal(chainPractice.context.chapterStats.chapters[0].positionReviews.cards[''].moveReviews.e4.recovered, true);
    assert.equal(chainPractice.context.smartTarget, null);
    const alternative = fixture(['e4']);
    alternative.context.trees[0].root.push({ move: 'd4', children: [] });
    alternative.context.smartSession = { newCount: 0 };
    alternative.context.smartTarget = { type: 'line', route: [1] };
    await alternative.context.handle_move('e2', 'e4');
    assert.equal(alternative.context.attempts, 0);
    assert.equal(alternative.context.smartSession.newCount, 0);
    assert.equal(alternative.context.chess.history().length, 0);
    assert.equal(Object.keys(alternative.context.chapterStats.chapters).length, 0);
    const mixedResponses = fixture(['e4']);
    mixedResponses.context.trees[0].root.push({ move: 'd4', children: [] });
    mixedResponses.context.smartSession = { newCount: 0 };
    mixedResponses.context.smartTarget = { type: 'position', expectedMove: 'd4' };
    const mixedCards = mixedResponses.context.positionReviews(mixedResponses.context.chapterStats, 0, 'chapter');
    mixedResponses.context.recordPositionReview(mixedCards, '', false, false, new Set());
    mixedResponses.context.recordContinuationReview(mixedCards, '', 'e4', false, false, true, true, null);
    mixedResponses.context.currentFailures()[''] = { failures: 1, cleanStreak: 0, recovered: false };
    const otherResponse = mixedResponses.context.handle_move('d2', 'd4');
    mixedResponses.waits.shift()();
    await otherResponse;
    assert.equal(mixedCards[''].moveReviews.d4.recovered, true);
    assert.equal(mixedCards[''].moveReviews.e4.recovered, false);
    assert.equal(mixedResponses.context.currentFailures()[''].recovered, false);
    console.log('Study navigation, context playback, cancellation and Smart correction checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
