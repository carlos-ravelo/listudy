const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
const model = vm.createContext({require});
vm.runInContext(read('modules/download_pgn.js').replace(/^export /gm, ''), model);
vm.runInContext(read('modules/study/lichess_analysis.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), model);
vm.runInContext(read('modules/study/chapter_editor.js').replace('export function', 'function'), model);
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const chapters = ['First', 'Second', 'Third'].map(title => ({title, fen, comment: title, headers: {}, root: []}));
const metadata = chapters.map(({title}) => ({title}));
let factory, confirm = true;
const requests = [];
const ground = {state: {orientation: 'white'}, set() {}, destroy() {}};
const context = vm.createContext({
    hasBlockingUi: () => false,
    require, URL, URLSearchParams, AbortController, Map, console,
    createChapterEditor: model.createChapterEditor,
    lichessAnalysisUrl: model.lichessAnalysisUrl, prepareLichessAnalysis: model.prepareLichessAnalysis,
    createPromotionPicker: () => ({destroy() {}}),
    Chessground: () => ground,
    setupStudyMoveTree: () => ({update() {}}), ground_legal_moves: () => new Map(),
    Alpine: {data(_, value) { factory = value; }, start() {}},
    window: {location: {href: 'https://listudy.test/en/studies/book/editor', search: ''}, confirm: () => confirm},
    document: {querySelector: () => ({getAttribute: () => 'csrf'})},
    fetch: (url, options) => new Promise(resolve => requests.push({url: String(url), options, resolve}))
});
vm.runInContext(read('modules/request_json.js').replace(/^export /gm, ''), context);
vm.runInContext(read('modules/editable_target.js').replace(/^export /gm, ''), context);
vm.runInContext(read('study_editor.js').replace(/^import .*;\n/gm, ''), context);
const controller = factory();
controller.$el = {dataset: {
    editor: JSON.stringify({chapters: metadata, chapter_index: 0, chapter: chapters[0]}),
    color: 'white', loadUrl: '/chapter', saveUrl: '/save', revision: 'original', loading: 'Loading',
    loadError: 'Load failed', saving: 'Saving', saved: 'Saved', unsaved: 'Unsaved'
}};
controller.$refs = {board: {}, moves: {}};
controller.init();
const change = index => controller.changeChapter({target: {value: String(index)}});
const comment = value => { controller.comment = value; controller.updateComment(value); };
const respond = (request, index, revision = 'original') => request.resolve({ok: true, json: async () => ({
    revision, editor: {chapters: metadata, chapter_index: index, chapter: chapters[index]}
})});

(async () => {
    assert.equal(controller.$el.dataset.editor, undefined, 'Drop the initial serialized tree after loading');
    assert.ok(controller.options.every(option => !('root' in option)));
    comment('Unsaved first chapter');
    confirm = false;
    await change(1);
    assert.equal(requests.length, 0);
    assert.equal(controller.comment, 'Unsaved first chapter');
    confirm = true;
    controller.exportPgn = 'An unimported draft';
    controller.pgnEdited = true;
    const failed = change(1);
    assert.equal(controller.loading, true);
    controller.play('e2', 'e4');
    requests[0].resolve({ok: false, json: async () => ({error: 'Chapter too large'})});
    await failed;
    assert.equal(controller.chapter, 0);
    assert.equal(controller.comment, 'Unsaved first chapter');
    assert.equal(controller.exportPgn, 'An unimported draft');
    assert.equal(controller.dirty, true);
    assert.equal(controller.status, 'Chapter too large');
    assert.equal(controller.loading, false);

    const old = change(1);
    const latest = change(2);
    assert.equal(requests[1].options.signal.aborted, true);
    respond(requests[2], 2);
    await latest;
    respond(requests[1], 1);
    await old;
    assert.equal(controller.chapter, 2, 'A late response must not replace the selected chapter');
    assert.equal(controller.comment, 'Third');
    assert.equal(controller.dirty, false);
    assert.equal(controller.pgnEdited, false);
    assert.equal(controller.canUndo, false, 'Chapter changes start a fresh history');

    comment('Saved third chapter');
    const save = controller.save();
    assert.equal(JSON.parse(requests[3].options.body).chapter_index, 2);
    requests[3].resolve({ok: true, json: async () => ({revision: 'saved'})});
    await save;
    controller.undo();
    assert.equal(controller.comment, 'Third');
    assert.equal(controller.dirty, true);
    controller.redo();
    assert.equal(controller.comment, 'Saved third chapter');
    assert.equal(controller.dirty, false);
    comment('Discard me');
    controller.discard();
    assert.equal(controller.comment, 'Saved third chapter');
    assert.equal(controller.dirty, false);
    assert.equal(controller.canUndo, false, 'Discard resets history to the saved baseline');

    const conflict = change(0);
    assert.equal(new URL(requests[4].url).searchParams.get('revision'), 'saved');
    requests[4].resolve({ok: false, status: 409, json: async () => ({error: 'Study changed'})});
    await conflict;
    assert.equal(controller.chapter, 2);
    assert.equal(controller.comment, 'Saved third chapter');
    assert.equal(controller.status, 'Study changed');

    controller.play('e2', 'e4');
    const beforeDelete = controller.exportPgn;
    for (const [state, busy] of [['saving', true], ['loading', true], ['setupMode', true], ['pendingPromotion', {}]]) {
        controller[state] = busy;
        controller.undo();
        controller.redo();
        controller.promoteVariation();
        controller.setAnnotation(4);
        controller.deleteFromHere();
        assert.equal(controller.exportPgn, beforeDelete);
        controller[state] = state === 'pendingPromotion' ? null : false;
    }
    let prevented = false;
    const key = {key: 'z', ctrlKey: true, target: {closest: () => null}, preventDefault() { prevented = true; }};
    controller.navigateKey(key);
    assert.equal(prevented, true);
    assert.equal(controller.hasPrevious, false);
    controller.navigateKey({...key, shiftKey: true});
    assert.equal(controller.hasPrevious, true);
    prevented = false;
    controller.navigateKey({...key, target: {closest: () => ({})}});
    assert.equal(prevented, false, 'Text inputs retain native undo');
    controller.deleteFromHere();
    assert.equal(controller.hasPrevious, false);
    assert.equal(controller.dirty, false);
    assert.ok(!controller.exportPgn.includes('e4'));

    const cancelled = change(1);
    await change(2);
    assert.equal(requests[5].options.signal.aborted, true);
    respond(requests[5], 1, 'saved');
    await cancelled;
    assert.equal(controller.chapter, 2);
    assert.equal(controller.loading, false);

    const destroyed = change(1);
    controller.destroy();
    respond(requests[6], 1, 'saved');
    await destroyed;
    assert.equal(controller.chapter, 2);
    console.log('Chapter loading, retained drafts, races, cancellation, save baselines and revision conflicts passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
