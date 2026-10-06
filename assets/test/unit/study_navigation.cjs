const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('@babel/parser');
const chessModule = require('chess.js');
const Chess = chessModule.Chess || chessModule;
const moveTreeContext = vm.createContext({ require });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/study_move_tree.js'), 'utf8')
    .replace(/^export /gm, ''), moveTreeContext);

const source = fs.readFileSync(path.join(__dirname, '../../js/study.js'), 'utf8');
const names = new Set([
    'handle_move', 'play_move', 'setup_move', 'change_analysis_board',
    'change_play_stockfish', 'refresh_manual_navigation', 'go_back', 'go_forward',
    'update_read_mode_ui', 'set_read_mode', 'play_read_move', 'seek_read_move'
]);
const declarations = parser.parse(source, { sourceType: 'module' }).program.body;
const functions = declarations
    .filter(node => node.type === 'FunctionDeclaration' && names.has(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n');

function fixture(moves, fen) {
    const root = moves.reduceRight((children, move) => [{ move, children }], []);
    const links = {
        analysis_board: { href: 'https://lichess.org/analysis' },
        play_stockfish: { href: '/play-stockfish' }
    };
    const board = {};
    const waits = [];
    const timers = [];
    const context = vm.createContext({
        chess: new Chess(fen), chapter: 0, curr_move: [0],
        trees: [{ root, headers: fen ? { SetUp: '1', FEN: fen } : {} }],
        trainingSessionId: 0, lineEligibleForReview: true, lineReviewRecorded: false,
        spacedReviewRunActive: false, weakChapterRunActive: false, readMode: false,
        total_moves: 0, combo_count: 0, attempts: 0, reviews: 0, resets: 0, advances: 0,
        max_depth: 100, DEPTH_MAX: 100, board_review: 'slow',
        i18n: { review_slow: 'slow', key_move_enabled: 'enabled' }, success_div: {}, error_div: {}, info_div: {},
        ground: { set: state => Object.assign(board, state), setShapes() {}, redrawAll() {} },
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
        tree_move_index: (access, san) => context.tree_possible_moves(access).findIndex(node => node.move === san),
        ai_move: access => context.tree_possible_moves(access)[0]?.move,
        ground_set_moves: () => { board.legalMoves = context.chess.moves(); },
        possible_promotion: () => '', update_value() {}, store_trees() {}, update_progress() {},
        record_chapter_attempt: () => context.attempts++,
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
        color: 'white', key_moves_mode: 'disabled', mode_free: 'free',
        setup_chess: fen => { context.chess = new Chess(fen); },
        ground_init_state() {},
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
    assert.equal(links.analysis_board.href, context.trees[0].headers.SetUp
        ? `https://lichess.org/analysis/${chess.fen()}`
        : `https://lichess.org/analysis/pgn/${encodeURIComponent(chess.pgn())}?color=${context.turn_color(chess)}`);
}

(async () => {
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
    assert.equal(reader.seek_read_move([]), false);
    assert.equal(reader.readMode, false);
    assert.equal(reader.lineEligibleForReview, true);
    assert.deepEqual(reader.chess.history(), ['e4']);
    reader.set_read_mode(true);
    assert.equal(reader.chess.history().length, 0);
    reader.trees[0].headers = { SetUp: '1', FEN: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' };
    reader.start_training();
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
    console.log('Study navigation regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
