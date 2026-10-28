const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const createLatestTask = require('./latest_task_helper.cjs');
const createPageScope = require('./page_scope_helper.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
const editor = read('study_editor.js'), endgame = read('endgames.js');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const methods = [
    between(editor, '        async analyzePosition()', '        syncPgn('),
    between(editor, '        async changeChapter(', '        beforeLeave('),
    between(editor, '        destroy()', '        beginSetup('),
    between(editor, '        toggleAnalysis()', '        async analyzePosition()')
].join('\n');

function editorFixture() {
    const analyses = [], requests = [], errors = [];
    let cancels = 0, disposals = 0;
    const engine = { cancel() { cancels++; }, dispose() { disposals++; }, analyze() { const task = deferred(); analyses.push(task); return task.promise; } };
    const analysisTasks = createLatestTask({ onCancel: () => engine.cancel() }), chapterTasks = createLatestTask();
    const context = vm.createContext({ URL, engine, analysisTasks, chapterTasks,
        currentChapter: { fen: 'original' }, editor: { position: () => ({ fen: () => 'original', turn: () => 'w' }) },
        config: { analysing: 'Thinking', engineError: 'Engine failed', revision: 'v1', loadUrl: '/chapter', loadError: 'Load failed', loading: 'Loading' },
        window: { location: { href: 'http://localhost/' }, confirm: () => true },
        console: { error: error => errors.push(error) }, chapterPicker: null, promotionPicker: null, ground: null,
        enginePosition: () => ({}), engineLine: () => 'e4 e5', createChapterEditor: chapter => ({ position: () => chapter }),
        requestJson(url, options) { const task = deferred(); requests.push({ ...task, url, options }); return task.promise; }
    });
    const component = vm.runInContext('({' + methods + '})', context);
    Object.assign(component, { options: [{ title: 'First' }, { title: 'Second' }, { title: 'Third' }],
        chapter: 0, analysisEnabled: true, refreshes: 0,
        refresh() { this.refreshes++; }, syncPgn() {} });
    return { context, component, analyses, requests, analysisTasks, chapterTasks, get cancels() { return cancels; }, get disposals() { return disposals; } };
}
const response = index => ({ revision: 'v1', editor: { chapter_index: index, chapter: { title: 'Loaded ' + index }, chapters: [{ title: 'First' }, { title: 'Second' }, { title: 'Third' }] } });
const event = index => ({ target: { value: String(index) } });

function endgameFixture() {
    const replies = [], hints = [], nodes = {}, messages = [], applied = [], renders = [];
    const scope = createPageScope();
    const context = vm.createContext({
        lifecycle: { run: scope }, opponentTasks: scope.use(createLatestTask()), reviewTasks: scope.use(createLatestTask()), hintTasks: scope.use(createLatestTask()),
        ended: false, reviewing: false, busy: false, color: 'white', chess: { turn: () => 'b', fen: () => 'current' },
        reviewState: null, reviewAnalysis: null, evaluationToggle: { checked: true }, picker: null,
        state: () => ({ fen: 'current' }), labels: { thinking: 'Thinking', engineError: 'Engine failed', unavailable: 'Unavailable', suggestion: 'Suggestion' },
        document: { getElementById: id => nodes[id] ||= {} }, boardReady() {},
        engine: { bestMove() { const task = deferred(); replies.push(task); return task.promise; } },
        feedback: { observe() {}, hint() { const task = deferred(); hints.push(task); return task.promise; } },
        applyReply: reply => applied.push(reply), set_text: (...message) => messages.push(message), error_div: 'error', info_div: 'info',
        moves: [], finishButton: {}, boardGame: { play: move => ({ ...move, san: 'e4' }) }, updateFen() {},
        ground: { setAutoShapes() {} }, continuation: () => 'e4', renderEvaluation() { renders.push(context.reviewAnalysis); }
    });
    vm.runInContext([
        between(endgame, 'function playMove(', 'function applyReply('),
        between(endgame, 'async function opponentMove()', 'function playUserMove('),
        between(endgame, 'async function refreshReviewEvaluation()', 'const gradeSymbols'),
        between(endgame, 'async function showHint()', "lifecycle.page.assign(document.getElementById('endgame_hint')")
    ].join('\n'), context);
    return { context, scope, replies, hints, nodes, messages, applied, renders };
}

(async () => {
    const page = editorFixture(), { component } = page;
    const first = component.analyzePosition(), second = component.analyzePosition();
    assert.equal(page.cancels, 1);
    page.analyses[0].reject(new Error('Old failure')); await first;
    assert.equal(component.analysisText, 'Thinking', 'Old analysis errors cannot replace current status');
    page.analyses[1].resolve({ score: { type: 'cp', value: 120 }, pv: [] }); await second;
    assert.equal(component.analysisText, '+1.2 · e4 e5');
    const third = component.analyzePosition(); component.toggleAnalysis();
    page.analyses[2].resolve({ score: { type: 'cp', value: 999 } }); await third;
    assert.equal(component.analysisText, 'Thinking', 'Disabling analysis invalidates its pending result');

    const chapterOne = component.changeChapter(event(1)), chapterTwo = component.changeChapter(event(2));
    assert.equal(page.requests[0].options.signal.aborted, true);
    const refreshes = component.refreshes;
    page.requests[0].reject(new Error('Aborted request')); await chapterOne;
    assert.equal(component.status, 'Loading');
    assert.equal(component.loading, true);
    assert.equal(component.refreshes, refreshes, 'Old chapter finally cannot clear loading or refresh the new request');
    page.requests[1].resolve(response(2)); await chapterTwo;
    assert.equal(component.chapter, 2);
    assert.equal(component.loading, false);
    const chapterBack = component.changeChapter(event(1));
    await component.changeChapter(event(2));
    assert.equal(page.requests[2].options.signal.aborted, true);
    page.requests[2].resolve(response(1)); await chapterBack;
    assert.equal(component.chapter, 2, 'Selecting the current chapter invalidates a pending switch');

    const finalAnalysis = component.analyzePosition(), finalChapter = component.changeChapter(event(0));
    component.destroy();
    page.analyses.at(-1).reject(new Error('Disposed analysis'));
    page.requests.at(-1).resolve(response(0));
    const oldStatus = component.status, oldRefreshes = component.refreshes;
    await Promise.all([finalAnalysis, finalChapter]);
    assert.equal(component.status, oldStatus);
    assert.equal(component.refreshes, oldRefreshes);
    assert.equal(component.chapter, 2);
    assert.equal(page.disposals, 1);
    const before = page.analyses.length;
    component.analysisEnabled = true;
    await component.analyzePosition();
    assert.equal(page.analyses.length, before, 'Disposed editor cannot start work');

    const game = endgameFixture(), ctx = game.context;
    const opponent = ctx.opponentMove();
    await ctx.opponentMove();
    assert.equal(game.replies.length, 1, 'Busy input cannot start another opponent query');
    ctx.reviewing = true;
    game.replies[0].resolve('e7e5'); await opponent;
    assert.equal(ctx.pendingReply, 'e7e5', 'A reply arriving during review stays queued for resume');
    assert.equal(game.applied.length, 0);
    ctx.reviewState = { fen: 'first' };
    const reviewOne = ctx.refreshReviewEvaluation();
    ctx.reviewState = { fen: 'second' };
    const reviewTwo = ctx.refreshReviewEvaluation();
    game.hints[0].resolve({ score: 'old' }); await reviewOne;
    assert.equal(game.renders.length, 0);
    game.hints[1].resolve({ score: 'new' }); await reviewTwo;
    assert.equal(ctx.reviewAnalysis.score, 'new');
    const hiddenEvaluation = ctx.refreshReviewEvaluation();
    ctx.evaluationToggle.checked = false;
    await ctx.refreshReviewEvaluation();
    game.hints[2].resolve({ score: 'hidden' }); await hiddenEvaluation;
    assert.equal(ctx.reviewAnalysis.score, 'new', 'Turning off evaluation discards pending display updates');

    ctx.reviewing = false;
    const hintOne = ctx.showHint(), hintTwo = ctx.showHint();
    game.hints[3].reject(new Error('Old hint failed')); await hintOne;
    assert.equal(game.messages.length, 0);
    game.hints[4].resolve({ uci: 'e2e4', pv: ['e2e4'] }); await hintTwo;
    assert.equal(game.messages.length, 1);
    const movingHint = ctx.showHint();
    ctx.playMove({ from: 'e2', to: 'e4' });
    game.hints[5].reject(new Error('Old position failed')); await movingHint;
    assert.equal(game.messages.length, 1, 'Moving suppresses old hint errors as well as old hint results');
    const lateHint = ctx.showHint(), lateReply = ctx.opponentMove();
    game.scope.destroy();
    game.hints[6].reject(new Error('Page hidden'));
    game.replies[1].resolve('g8f6');
    await Promise.all([lateHint, lateReply]);
    assert.equal(game.messages.length, 1, 'Navigation suppresses stale failure messages');
    assert.equal(game.applied.length, 0, 'Navigation suppresses stale opponent moves');
    const count = game.hints.length;
    await ctx.showHint();
    assert.equal(game.hints.length, count, 'Hidden/disposed runs cannot request hints');
    console.log('Training async adapters: analysis/chapter supersession, stale finally, review, hints and teardown races passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
