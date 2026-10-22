const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const study = fs.readFileSync(path.join(__dirname, '../../js/study.js'), 'utf8');
const noop = () => {};
const pgn = '1. e4 (1. d4 d5 2. c4) (1. f3 $2 e5 2. g4 Qh4#) e5 2. Nf3 *';
function harness({ source = pgn, tactics = true, wait = async () => {}, actualReplies = false } = {}) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { hidden: true, disabled: false, focus() { this.focused = true; } });
        return elements.get(id);
    };
    const events = [], state = { movable: {} };
    const context = vm.createContext({
        require, ...require('ts-fsrs'), ChessModule, console: { log: noop },
        chapter: 0, studyColor: 'white', color: 'white', readMode: false, tacticsCollection: tactics,
        trainingSessionId: 1, tacticsTrap: null, sparring: null, contextReplayActive: false,
        smartSession: null, smartTarget: null, failedPositionRun: null, spacedReviewRunActive: false,
        weakChapterRunActive: false, chapterReviewSignatures: ['test'],
        chapterStats: { version: 1, chapters: {} }, positionAttempts: new Set(), assistedPositions: new Set(),
        lineReviewRecorded: false, lineEligibleForReview: true, total_moves: 0, combo_count: 3,
        curr_move: [0], chess: new Chess(), document: { getElementById: element },
        i18n: { tactics_commented_variation: 'neutral', tactics_trap_failed: 'trap', error_wrong_move: 'invalid' },
        info_div: 'info', error_div: 'error', success_div: 'success', comments_div: 'comments',
        set_text: (id, value) => events.push(['text', id, value]), clear_all_text: noop,
        overlay_manager: { mark_current_overlays_seen: () => events.push(['overlays']), clear_overlays: noop },
        studyMoveNavigation: { update: noop },
        ground: { set(update) { Object.assign(state, update); }, setShapes: noop },
        ground_move: (move, board) => events.push(['render', move.san, board.fen()]),
        ground_undo_last_move: () => events.push(['undo']),
        ground_set_moves: () => { state.movable = { dests: new Map([['e2', ['e4']]]) }; },
        turn_color: board => board.turn() === 'w' ? 'white' : 'black',
        uci_to_san(board, from, to) { const move = board.move({ from, to, promotion: 'q' }); board.undo(); return move.san; },
        visualization: {
            active: true, previewFailure: () => events.push(['preview']),
            finishFailure: () => events.push(['finish']),
            endFailure: noop,
            decision: correct => events.push(['visualization', correct]),
            block: noop, render: noop, settle: noop, reply: noop
        },
        studySessions: { decision: (...args) => events.push(['session', ...args]) },
        StorageAdapter: { setItem: noop }, chapter_stats_key: () => 'stats',
        updateContextReplayUi: noop, change_play_stockfish: noop, change_analysis_board: noop,
        display_arrows: noop, display_comments: noop, show_suggestions: noop, update_read_mode_ui: noop,
        updateFailedPositionsUi: noop, update_progress: noop, publishStudyRunStatus: noop,
        finish_chapter_practice: completed => events.push(['complete', completed]), achievement_end_of_line: noop, right_move_text: () => 'correct',
        practiceDepth: { limit: Infinity }, get_move_delay: () => 0, sleep: wait, smartIntroductionMove: () => null,
        ai_move: () => undefined
    });
    context.preferences = { get: () => undefined };
    context.window = context;
    for (const file of ['tree.js', 'tree_from_pgn.js', 'tree_utils.js', 'study/tactics_mainline.js', 'study/tactics_trap.js',
        'study/chapter_stats.js', 'study/review_history.js', 'study/position_review.js', 'study/failed_positions.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules', file), 'utf8')
            .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, '').replace(/^export /gm, ''), context);
    }
    const parsed = require('pgn-parser').parse('[Event "Layers"]\n' + source);
    context.annotate_pgn(parsed);
    context.readingTrees = context.generate_move_trees(parsed, { tactics });
    context.practiceTrees = tactics ? context.tacticsMainline(context.readingTrees, 'white') : context.readingTrees;
    context.trees = context.practiceTrees;
    vm.runInContext(`
        function currentPositionId() { return curr_move.slice(1).map((_, i) => tree_get_node(curr_move.slice(0, i + 2)).move).join('|'); }
        function currentFailures() { return chapterFailures(chapterStats, chapter, chapterReviewSignatures[chapter]); }
        function record_chapter_attempt(correct, move, position, assisted) {
            events.push(['attempt', correct]); recordChapterAttempt(chapterStats, chapter, correct, move, position, assisted);
        }
        function record_line_review(correct) { events.push(['line', correct]); lineReviewRecorded = true; }
        function play_move(san) { chess.move(san); curr_move.push(tree_move_index(curr_move, san)); }
        function set_read_mode(reading) { readMode = reading; trainingSessionId++; trees = readingTrees; currentTacticsTrap(); }
        function seek_read_move(path) { events.push(['solution', Array.from(path)]); }
    `, Object.assign(context, { events }));
    const promotionStart = study.indexOf('function san_promotion_prefix(');
    vm.runInContext(study.slice(promotionStart, study.indexOf('function updateWeakChapterRunUi()', promotionStart)), context);
    const setupStart = study.indexOf('function setup_move()');
    vm.runInContext(study.slice(setupStart, study.indexOf('\n/*', setupStart)), context);
    if (actualReplies) {
        const aiStart = study.indexOf('function ai_move(access)');
        vm.runInContext(study.slice(aiStart, study.indexOf('function play_move(san)', aiStart)), context);
        context.Math = Object.create(Math);
    }
    return { context, events, state, element };
}
(async () => {
    // A recognized sideline must leave every scoring and review channel untouched.
    const neutral = harness();
    await neutral.context.handle_move('d2', 'd4');
    assert.equal(neutral.context.total_moves, 0);
    assert.equal(neutral.context.combo_count, 3);
    assert.equal(JSON.stringify(neutral.context.chapterStats.chapters), '{}');
    assert.equal(neutral.context.positionAttempts.size, 0);
    assert(!neutral.events.some(event => ['visualization', 'session', 'attempt', 'overlays'].includes(event[0])));
    assert(neutral.events.some(event => event[2] === 'neutral'));
    assert.equal(neutral.context.chess.history().length, 0);

    const correct = harness();
    await correct.context.handle_move('e2', 'e4');
    assert.equal(correct.context.chapterStats.chapters[0].errors, 0);
    assert.equal(correct.context.chapterStats.chapters[0].attempts, 1);
    assert.equal(correct.context.chess.history()[0], 'e4');

    const invalid = harness();
    await invalid.context.handle_move('a2', 'a3');
    assert.equal(invalid.context.chapterStats.chapters[0].errors, 1);
    assert.equal(invalid.context.combo_count, 0);
    assert.equal(invalid.context.currentTacticsTrap(), null);
    assert(invalid.events.some(event => event[2] === 'invalid'));

    // Refutation uses its own board; the recorded failure belongs to the source position.
    const trap = harness();
    const originalFen = trap.context.chess.fen();
    await trap.context.handle_move('f2', 'f3');
    assert.deepEqual(trap.events.filter(event => event[0] === 'render').map(event => event[1]), ['f3', 'e5']);
    assert(trap.events.findIndex(event => event[1] === 'e5') < trap.events.findIndex(event => event[0] === 'attempt'));
    assert.equal(trap.context.chapterStats.chapters[0].errors, 1);
    assert.equal(trap.context.chapterStats.chapters[0].attempts, 1);
    assert.equal(trap.context.chapterStats.chapters[0].failedPositions.positions[''].fen, originalFen);
    assert.equal(trap.context.chapterStats.chapters[0].failedPositions.positions[''].played, 'f3');
    assert.equal(trap.context.chapterStats.chapters[0].positionReviews.cards[''].positionFen, originalFen.split(' ').slice(0, 4).join(' '));
    assert.equal(trap.context.chess.fen(), originalFen);
    assert.equal(trap.context.curr_move.length, 1);
    assert.equal(trap.context.combo_count, 0);
    assert.equal(trap.state.movable.dests.size, 0);
    assert.equal(trap.element('study_tactics_failure').hidden, false);
    assert.equal(trap.element('study_tactics_retry').focused, true);
    await trap.context.handle_move('g2', 'g4');
    assert.equal(trap.context.chapterStats.chapters[0].errors, 1, 'No further moves or duplicate failures while locked');
    trap.context.retryTacticsTrap();
    assert.equal(trap.element('study_tactics_failure').hidden, true);
    assert.equal(trap.state.fen, originalFen);
    assert(trap.state.movable.dests.size > 0);
    assert.equal(trap.context.currentTacticsTrap(), null);

    const solution = harness();
    await solution.context.handle_move('f2', 'f3');
    solution.context.showTacticsSolution();
    assert.equal(solution.context.readMode, true);
    assert.equal(solution.context.currentTacticsTrap(), null);
    assert(solution.events.some(event => event[0] === 'solution'));

    const deeper = harness({ source: '1. e4 e5 2. Nf3 (2. f3? Nc6 3. g4) Nc6 3. Bb5 *' });
    deeper.context.chess.move('e4');
    deeper.context.chess.move('e5');
    deeper.context.curr_move = [0, 0, 0];
    const deeperFen = deeper.context.chess.fen();
    await deeper.context.handle_move('f2', 'f3');
    const failure = deeper.context.chapterStats.chapters[0].failedPositions.positions['e4|e5'];
    assert.equal(failure.fen, deeperFen);
    assert.deepEqual(Array.from(failure.path), [0, 0]);
    assert.deepEqual(Array.from(failure.expected), ['Nf3']);
    assert.deepEqual(deeper.events.filter(event => event[0] === 'render').map(event => event[1]), ['f3', 'Nc6']);
    deeper.context.retryTacticsTrap();
    assert.equal(deeper.state.fen, deeperFen);

    const noReply = harness({ source: '1. e4 (1. f3??) e5 2. Nf3 *' });
    await noReply.context.handle_move('f2', 'f3');
    assert.deepEqual(noReply.events.filter(event => event[0] === 'render').map(event => event[1]), ['f3']);
    assert.equal(noReply.context.chapterStats.chapters[0].errors, 1);

    // Pause either before or after the rival reply and change training sessions.
    for (const cancelAt of [1, 2]) {
        let release, calls = 0;
        const cancelled = harness({ wait: () => ++calls === cancelAt ? new Promise(resolve => { release = resolve; }) : Promise.resolve() });
        const pending = cancelled.context.handle_move('f2', 'f3');
        while (!release) await Promise.resolve();
        await cancelled.context.handle_move('e2', 'e4');
        assert.equal(cancelled.context.total_moves, 0, 'Moves are blocked during animation');
        cancelled.context.trainingSessionId++;
        cancelled.context.chapter = 1;
        release();
        await pending;
        assert.equal(JSON.stringify(cancelled.context.chapterStats.chapters), '{}');
        assert.equal(cancelled.context.currentTacticsTrap(), null);
        assert.equal(cancelled.context.total_moves, 0);
        assert.equal(cancelled.events.filter(event => event[0] === 'render').length, cancelAt);
    }

    for (const options of [{ smartSession: { newCount: 0, reviewCount: 0 }, smartTarget: { type: 'position' } },
        { failedPositionRun: { transitioning: false, index: 0, positions: [{}] } }]) {
        const run = harness();
        Object.assign(run.context, options);
        await run.context.handle_move('f2', 'f3');
        assert.equal(run.context.chapterStats.chapters[0].errors, 1);
        assert.equal(run.context.currentTacticsTrap().failed, true);
        assert.equal(run.state.movable.dests.size, 0);
    }

    const defenses = '1. e4 (1. d4 d5) e5 (1... c5 2. Nc3 (2. Nf3 d6) (2. f3? e5)) 2. Nf3 *';
    const selected = new Set();
    for (const sample of [0, 0.999999]) {
        const run = harness({ source: defenses, actualReplies: true });
        run.context.Math.random = () => sample;
        await run.context.handle_move('e2', 'e4');
        const reply = run.context.chess.history()[1];
        selected.add(reply);
        assert.equal(run.context.chess.history().length, 2);
        assert(!run.events.some(event => event[0] === 'complete'), 'A defense still needs its specific user answer');
        if (reply === 'c5') {
            // A documented user sideline under this defense remains neutral.
            await run.context.handle_move('g1', 'f3');
            assert.equal(run.context.chapterStats.chapters[0].attempts, 1);
            assert.equal(run.context.total_moves, 1);
            assert.equal(run.context.chess.history().length, 2);
            assert(run.events.some(event => event[2] === 'neutral'));
            await run.context.handle_move('b1', 'c3');
        } else {
            await run.context.handle_move('g1', 'f3');
        }
        assert.equal(run.context.chapterStats.chapters[0].errors, 0);
        assert.equal(run.context.chapterStats.chapters[0].attempts, 2);
        const expected = reply === 'c5' ? 'Nc3' : 'Nf3';
        assert(run.context.chapterStats.chapters[0].coveredMoves.includes(`e4|${reply}|${expected}`));
        assert(run.events.some(event => event[0] === 'complete' && event[1] === true));
        assert.equal(run.context.positionAttempts.size, 2);
    }
    assert.deepEqual([...selected].sort(), ['c5', 'e5'], 'Random sampling can select either documented defense');

    const branchTrap = harness({ source: defenses, actualReplies: true });
    branchTrap.context.Math.random = () => 0.999999;
    await branchTrap.context.handle_move('e2', 'e4');
    await branchTrap.context.handle_move('f2', 'f3');
    assert.deepEqual(branchTrap.events.filter(event => event[0] === 'render').map(event => event[1]), ['f3', 'e5']);
    assert.equal(branchTrap.context.chapterStats.chapters[0].errors, 1);
    assert.equal(branchTrap.context.chapterStats.chapters[0].failedPositions.positions['e4|c5'].played, 'f3');
    assert.deepEqual(Array.from(branchTrap.context.chapterStats.chapters[0].failedPositions.positions['e4|c5'].expected), ['Nc3']);
    assert.equal(branchTrap.context.currentTacticsTrap().failed, true);

    const branchError = harness({ source: '1. e4 e5 (1... c5 2. Nc3) 2. Nf3 *', actualReplies: true });
    branchError.context.Math.random = () => 0.999999;
    await branchError.context.handle_move('e2', 'e4');
    await branchError.context.handle_move('g1', 'f3');
    assert.equal(branchError.context.chapterStats.chapters[0].errors, 1);
    assert(!branchError.events.some(event => event[0] === 'complete'), 'The answer to a different defense cannot finish this branch');

    const incomplete = harness({ source: '1. e4 e5 (1... c5) 2. Nf3 *', actualReplies: true });
    incomplete.context.Math.random = () => 0.999999;
    assert.equal(incomplete.context.ai_move([0, 0]), 'e5', 'Do not select a defense without a documented user response');

    // Scheduled reviews must reach their selected position instead of changing
    // defenses at random midway through the route.
    const directed = harness({ source: defenses, actualReplies: true });
    directed.context.smartTarget = { type: 'line', chapter: 0, route: [0, 1, 0] };
    directed.context.Math.random = () => 0;
    assert.equal(directed.context.ai_move([0, 0]), 'c5');

    const weighted = harness({ source: defenses, tactics: false, actualReplies: true });
    vm.runInContext("function tree_size_weighted_random_move() { return 'e5'; }", weighted.context);
    assert.equal(weighted.context.ai_move([0, 0]), 'e5', 'Repertoires retain their existing weighted reply selection');

    const repertoire = harness({ tactics: false });
    await repertoire.context.handle_move('d2', 'd4');
    assert.equal(repertoire.context.chapterStats.chapters[0].errors, 0);
    assert.equal(repertoire.context.chess.history()[0], 'd4', 'Repertoires continue accepting their documented branches');
    assert.equal(repertoire.context.currentTacticsTrap(), null);
    console.log('Four-layer tactics validation, neutral grading, refutation, retry, solution, cancellation and repertoire isolation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
