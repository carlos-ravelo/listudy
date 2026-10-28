const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const createPageScope = require('./page_scope_helper.cjs');
const commentContext = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/comments.js'), 'utf8')
    .replace(/^export /gm, ''), commentContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/run_lifecycle.js'), 'utf8')
    .replace(/^export /gm, ''), commentContext);

function createContext(values) {
    const context = vm.createContext(values);
    require('./board_game_helper.cjs')(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/board_interaction.js'), 'utf8').replace(/^export /gm, ''), context);
    const keys = { arrows: 'show_arrows', arrowType: 'arrow_type', comments: 'show_comments',
        review: 'board_review', keyMoves: 'key_moves_mode', moveDelay: 'move_delay_time' };
    context.selectStudyComments = commentContext.selectStudyComments;
    context.projectStudyCommentRows = commentContext.projectStudyCommentRows;
    context.publishStudyComments = rows => { context.commentRows = rows || []; };
    context.unescape_string = value => value;
    context.tree_get_node_string = move => move.move || '';
    context.publishStudyRunStatus = () => {};
    context.preferences = { get: name => context[keys[name]] };
    context.practiceDepth = { get limit() { return context.depth_limit_enabled ? context.max_depth : Infinity; } };
    context.studyRun = commentContext.createStudyRun({ getChapter: () => context.chapter,
        replay: options => context.replayPositionContext(options), pause: delay => context.sleep(delay) });
    context.pageScope = createPageScope({ timers: {
        setTimeout: (callback, delay) => context.setTimeout(callback, delay),
        clearTimeout: id => context.clearTimeout?.(id)
    } });
    context.pageScope.sleep = delay => context.sleep(delay);
    return context;
}

const parser = require('@babel/parser');
const chessModule = require('chess.js');
const Chess = chessModule.Chess || chessModule;
const statsContext = createContext({ sparring: null, visualization: null,});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/chapter_stats.js'), 'utf8')
    .replace(/export \{[^}]+\};/, ''), statsContext);
const moveTreeContext = createContext({ sparring: null, visualization: null, require });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/download_pgn.js'), 'utf8')
    .replace(/^export /gm, ''), moveTreeContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/lichess_analysis.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), moveTreeContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/study_move_tree.js'), 'utf8')
    .replace(/^export /gm, ''), moveTreeContext);

vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/position_context.js'), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, ''), moveTreeContext);
const source = fs.readFileSync(path.join(__dirname, '../../js/study.js'), 'utf8');
const reviewContext = createContext({ sparring: null, visualization: null, ...require('ts-fsrs'), ChessModule: chessModule });
for (const file of ['review_history.js', 'position_review.js', 'failed_positions.js', 'move_grading.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study', file), 'utf8').replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, '').replace(/^export /gm, ''), reviewContext);
const names = new Set([
    'currentPositionId', 'currentFailures', 'presentPracticePosition', 'replayContextFromStart',
    'handle_move', 'handle_read_move', 'handle_practice_move', 'play_move', 'setup_move', 'change_analysis_board',
    'change_play_stockfish', 'refresh_manual_navigation', 'go_back', 'go_forward',
    'update_read_mode_ui', 'set_read_mode', 'play_read_move', 'seek_read_move',
    'finish_chapter_practice', 'chapter_stats_key', 'smartIntroductionMove'
]);
const declarations = parser.parse(source, { sourceType: 'module' }).program.body;
const functions = declarations
    .filter(node => node.type === 'FunctionDeclaration' && names.has(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n');

function fixture(moves, fen, orientation = 'white') {
    const root = moves.reduceRight((children, move, move_index) => [{ move, move_index, children }], []);
    const links = {
        analysis_board: { href: 'https://lichess.org/analysis', dataset: {} },
        play_stockfish: { href: '/play-stockfish' }
    };
    const board = { orientation };
    const waits = [];
    const timers = [];
    const context = createContext({ sparring: null, visualization: null,
        chess: new Chess(fen), chapter: 0, curr_move: [0],
        trees: [{ root, sourceIndex: 1, headers: fen ? { SetUp: '1', FEN: fen } : {} }],
        chapterPgns: ['[Event "Empty"]\n\n*',
            `${fen ? `[SetUp "1"]\n[FEN "${fen}"]\n` : ''}[Event "Chapter"]\n\n${moves.join(' ')} *`],
        lichessAnalysisUrl: moveTreeContext.lichessAnalysisUrl,
        prepareLichessAnalysis: moveTreeContext.prepareLichessAnalysis,
        gradeStudyMove: reviewContext.gradeStudyMove, lineEligibleForReview: true, lineReviewRecorded: false,
        chapterStats: { version: 1, chapters: {} }, practiceChapter: null,
        chapterReviewSignatures: ['chapter'], study_id: 'study',
        beginChapterPractice: statsContext.beginChapterPractice,
        finishChapterPractice: statsContext.finishChapterPractice,
        StorageAdapter: { setItem() {} },
        updateContextReplayUi() {}, comments_div: 'comments',
        tacticsTrap: null, currentTacticsTrap: () => null, updateTacticsTrapUi() {},
        studySessions: { begin() {}, decision() {}, end() {}, boundary() { return false; } },
        replayPositionContext: moveTreeContext.replayPositionContext,
        smartSession: null, smartTarget: null, failedPositionRun: null,
        positionAttempts: new Set(), assistedPositions: new Set(), NEW_POSITION_LIMIT: 10,
        positionReviews: reviewContext.positionReviews, recordPositionReview: reviewContext.recordPositionReview,
        introducedMoves: reviewContext.introducedMoves, recordIntroducedMove: reviewContext.recordIntroducedMove,
        introduceContinuation: reviewContext.introduceContinuation,
        continuationKey: reviewContext.continuationKey, reviewExposureKey: reviewContext.reviewExposureKey,
        recordContinuationReview: reviewContext.recordContinuationReview,
        chapterFailures: reviewContext.chapterFailures, recordPositionResult: reviewContext.recordPositionResult,
        updateFailedPositionsUi() {}, selectNextSmartPosition: () => context.advances++,
        spacedReviewRunActive: false, weakChapterRunActive: false, readMode: false, tacticsCollection: false,
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
        tree_possible_moves: access => access.slice(1).reduce((nodes, index) => nodes[index].children, context.trees[access[0]].root),
        tree_children: access => context.tree_possible_moves(access),
        tree_get_node: access => access.slice(1).reduce((parent, index) => parent.children[index], { children: context.trees[access[0]].root }),
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
    const actual = [...board.movable.dests].flatMap(([from, targets]) => targets.map(to => from + to));
    const expected = chess.moves({verbose: true}).map(move => move.from + move.to);
    assert.deepEqual(new Set(actual), new Set(expected));
    assert.equal(board.movable.color, 'both');
    const last = chess.history({ verbose: true }).slice(-1)[0];
    assert.equal(JSON.stringify(board.lastMove), JSON.stringify(last ? [last.from, last.to] : undefined));
    assert.equal(links.play_stockfish.href, `/play-stockfish#${chess.fen()}`);
    assert.equal(links.analysis_board.href, moveTreeContext.lichessAnalysisUrl(
        context.chapterPgns[context.trees[context.chapter].sourceIndex], board.orientation,
        chess.fen(), context.curr_move.slice(1)));
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

    const tactics = fixture(['e4', 'e5', 'Nf3']);
    const trainer = tactics.context;
    trainer.chapterPgns[1] = '[Event "Tactics"]\n\n1. e4 e5 (1... c5 {Defense}) 2. Nf3 (2. Nc3) *';
    trainer.change_analysis_board();
    assert.equal(decodeURIComponent(new URL(tactics.links.analysis_board.href).pathname.slice('/analysis/pgn/'.length)),
        '[Event "Tactics"]\n\n1. e4 e5 (1... c5  ) 2. Nf3 (2. Nc3) *', 'Include every defense and alternative in the comment-free analysis URL');
    assert.ok(trainer.chapterPgns[1].includes('{Defense}'), 'Keep comments in the source chapter');
    trainer.tacticsCollection = true;
    trainer.trees[0].first_variation = null;
    trainer.trees[0].root.push({ move: 'd4', children: [], move_index: 0 });
    trainer.readingTrees = trainer.trees;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/tactics_mainline.js'), 'utf8')
        .replace(/export \{[^}]+\};/, ''), trainer);
    trainer.practiceTrees = trainer.tacticsMainline(trainer.readingTrees, 'white');
    trainer.chapterMoveCatalogs = [statsContext.chapterMoveCatalog(trainer.practiceTrees[0].root, true)];
    const startTraining = declarations.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'start_training');
    vm.runInContext(source.slice(startTraining.start, startTraining.end), trainer);
    trainer.start_training();
    assert.equal(trainer.tree_possible_moves([0]).map(node => node.move).join(','), 'e4');
    trainer.set_read_mode(true);
    assert.equal(trainer.tree_possible_moves([0]).map(node => node.move).join(','), 'e4,d4');
    assert.equal(trainer.play_read_move('d4'), true);
    assert.deepEqual(trainer.chess.history(), ['d4']);
    trainer.set_read_mode(false);
    assert.equal(trainer.chess.history().length, 0);
    assert.equal(trainer.tree_possible_moves([0]).map(node => node.move).join(','), 'e4');
    assert.equal(trainer.curr_move.length, 1, 'Leaving an illustrative variation resets the training path');

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
    install('display_comments');
    reader.display_comments(false);
    assert.equal(reader.commentRows[0].text, 'Chapter explanation');
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
        assert.equal(context.studyRun.revision, 0);
        assert.equal(context.lineEligibleForReview, true);
        for (const move of moves) {
            context.go_forward();
            assert.equal(context.chess.history().slice(-1)[0], move);
            assertSynchronized(test);
        }
        const session = context.studyRun.revision;
        context.go_forward();
        assert.equal(context.studyRun.revision, session);
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
    assert(reply.links.analysis_board.href.includes(encodeURIComponent(reply.context.chapterPgns[1])));
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
    assert.equal(replay.context.studyRun.replaying, true);
    await replay.context.handle_move('e2', 'e4');
    assert.equal(replay.context.attempts, 0);
    for (let index = 0; index < 5; index++) {
        assert.equal(replay.waits.length, 1);
        replay.waits.shift()();
        await new Promise(setImmediate);
    }
    await replaying;
    assert.equal(replay.context.studyRun.replaying, false);
    assert.equal(replay.context.chess.history().join(' '), 'e4 e5 Nf3 Nc6');
    assert.equal(replay.context.curr_move.join(','), '0,0,0,0,0');
    assert.equal(replay.context.attempts, 0);
    assert.equal(replay.context.reviews, 0);
    assert.equal(replay.context.positionAttempts.has('previous'), true);
    assert.equal(replay.context.assistedPositions.has('hinted'), true);
    assertSynchronized(replay);
    const canceled = fixture(['e4', 'e5', 'Nf3']);
    const pendingContext = canceled.context.presentPracticePosition([0, 0], 4);
    canceled.context.studyRun.invalidate();
    canceled.context.studyRun.stopReplay();
    canceled.context.chess = new Chess();
    canceled.waits.shift()();
    await pendingContext;
    assert.equal(canceled.context.chess.history().length, 0);
    assert.equal(canceled.context.studyRun.replaying, false);
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
    const introducedCard = chainPractice.context.chapterStats.chapters[0].positionReviews.cards[''].moveReviews.e4;
    assert.equal(introducedCard.card.reps, 0);
    assert.equal(introducedCard.history.length, 0);
    assert.equal(chainPractice.context.attempts, 0);
    assert.equal(chainPractice.context.chapterStats.chapters[0].errors, 0);
    assert.equal(chainPractice.context.chapterStats.chapters[0].coveredMoves, undefined);
    assert.equal(chainPractice.context.currentFailures()[''], undefined);
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

    const guided = fixture(['e4', 'e5', 'Nf3']);
    guided.context.smartSession = { newCount: 0, reviewCount: 0 };
    guided.context.smartTarget = { type: 'line', chapter: 0, path: [], route: [0, 0, 0] };
    guided.context.trees[0].root.push({ move: 'd4', children: [] });
    guided.context.trees[0].root[0].comments = [{ text: 'Control the center.' }];
    guided.context.trees[0].root[1].comments = [{ text: 'Another opening.' }];
    const displayNames = ['display_arrows', 'display_comments', 'give_hints'];
    vm.runInContext(declarations.filter(node => node.type === 'FunctionDeclaration' && displayNames.includes(node.id.name))
        .map(node => source.slice(node.start, node.end)).join('\n'), guided.context);
    guided.context.create_arrow_from_move = (san, brush) => ({ san, brush });
    guided.context.ground.setShapes = shapes => { guided.board.shapes = shapes; };
    guided.context.show_arrows = 'hidden';
    guided.context.show_comments = 'hidden';
    assert.equal(guided.context.smartIntroductionMove().move, 'e4');
    guided.context.display_arrows(false);
    guided.context.display_comments(false);
    assert.equal(guided.board.shapes.length, 1);
    assert.equal(guided.board.shapes[0].san, 'e4');
    assert.equal(guided.context.commentRows.map(row => row.text).join(','), 'Control the center.');
    assert.equal(guided.context.assistedPositions.size, 0);
    guided.context.visualization = { hidden: true };
    guided.context.display_comments(true);
    assert.equal(guided.context.commentRows.length, 0, 'Hidden visualization suppresses even explicit comment hints');
    guided.context.visualization = null;
    const blockedComments = guided.context.studyRun.replayPosition({ root: guided.context.trees[0].root,
        path: [], count: 0, present() {}, advance() {}, finish() {} });
    guided.context.display_comments(true);
    assert.equal(guided.context.commentRows.length, 0, 'Context replay clears explanations');
    await blockedComments;
    guided.context.display_comments(false);
    assert.equal(guided.context.commentRows.length, 1, 'Rendering resumes after a clear');
    assert.equal(guided.context.assistedPositions.size, 0);
    assert.equal(guided.context.lineEligibleForReview, false);
    await guided.context.handle_move('c2', 'c4');
    assert.equal(guided.context.attempts, 0);
    assert.equal(guided.context.total_moves, 0);
    assert.equal(guided.context.smartSession.newCount, 0);
    assert.equal(Object.keys(guided.context.chapterStats.chapters).length, 0);
    vm.runInContext(source.slice(aiDeclaration.start, aiDeclaration.end), guided.context);
    const guidedMove = guided.context.handle_move('e2', 'e4');
    guided.waits.shift()();
    await guidedMove;
    assert.equal(guided.context.chess.history().join(' '), 'e4 e5');
    assert.equal(guided.context.smartIntroductionMove().move, 'Nf3');
    assert.equal(guided.context.smartSession.newCount, 1);
    assert.equal(guided.context.smartSession.reviewCount, 0);
    assert.equal(guided.context.currentFailures()[''], undefined);

    const early = fixture(['e4']);
    const earlyCards = early.context.positionReviews(early.context.chapterStats, 0, 'chapter');
    early.context.introduceContinuation(earlyCards, '', 'e4');
    early.context.smartSession = { newCount: 0 };
    early.context.smartTarget = { type: 'position', expectedMove: 'e4' };
    const earlyMove = early.context.handle_move('e2', 'e4');
    early.waits.shift()();
    await earlyMove;
    assert.equal(early.context.currentFailures()[''], undefined);
    assert.equal(earlyCards[''].moveReviews.e4.card.reps, 0);

    const reviewLine = fixture(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    reviewLine.context.smartSession = { newCount: 0, reviewCount: 0 };
    reviewLine.context.smartTarget = { type: 'line', chapter: 0, path: [], route: [0, 0, 0, 0, 0],
        reviewChain: true, completeLine: true };
    vm.runInContext(source.slice(aiDeclaration.start, aiDeclaration.end), reviewLine.context);
    const reviewCards = reviewLine.context.positionReviews(reviewLine.context.chapterStats, 0, 'chapter');
    const future = new Date(Date.now() + 86400000);
    for (const [id, move] of [['', 'e4'], ['e4|e5', 'Nf3'], ['e4|e5|Nf3|Nc6', 'Bb5']]) {
        reviewLine.context.introduceContinuation(reviewCards, id, move);
        reviewCards[id].card.due = future;
        reviewCards[id].moveReviews[move].card.due = future;
    }
    reviewCards[''].card.due = new Date(Date.now() - 1000);
    reviewCards[''].moveReviews.e4.card.due = new Date(Date.now() - 1000);
    const futureSnapshot = JSON.stringify([reviewCards['e4|e5'].card, reviewCards['e4|e5'].moveReviews.Nf3]);
    for (const [from, to] of [['e2', 'e4'], ['g1', 'f3'], ['f1', 'b5']]) {
        assert.equal(reviewLine.context.smartIntroductionMove(), null);
        const move = reviewLine.context.handle_move(from, to);
        reviewLine.waits.shift()();
        await move;
    }
    assert.equal(reviewLine.context.chess.history().join(' '), 'e4 e5 Nf3 Nc6 Bb5');
    assert.equal(reviewLine.context.smartSession.reviewChains, 1);
    assert.equal(reviewLine.context.smartSession.newCount, 0);
    assert.equal(reviewLine.context.smartSession.reviewCount, 1);
    assert.equal(JSON.stringify([reviewCards['e4|e5'].card, reviewCards['e4|e5'].moveReviews.Nf3]), futureSnapshot,
        'Context moves must not inflate future intervals');
    assert.equal(reviewCards[''].moveReviews.e4.card.reps, 1);
    assert.equal(reviewLine.context.smartSession.recalledOpenings.size, 3);

    const diagnostic = fixture(['e4', 'e5', 'Nf3']);
    diagnostic.context.smartSession = { newCount: 0 };
    diagnostic.context.smartTarget = { type: 'line', chapter: 0, path: [], route: [0, 0, 0], reviewChain: true };
    const diagnosticCards = diagnostic.context.positionReviews(diagnostic.context.chapterStats, 0, 'chapter');
    diagnostic.context.introduceContinuation(diagnosticCards, '', 'e4');
    diagnosticCards[''].card.due = future;
    diagnosticCards[''].moveReviews.e4.card.due = future;
    await diagnostic.context.handle_move('d2', 'd4');
    assert.equal(diagnosticCards[''].moveReviews.e4.recovered, false);
    assert.equal(diagnosticCards[''].moveReviews.e4.card.reps, 1);
    assert(new Date(diagnosticCards[''].moveReviews.e4.card.due) < future);
    assert.equal(diagnostic.context.currentFailures()[''].failures, 1);
    assert.equal(diagnostic.context.smartSession.newCount, 0);
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
