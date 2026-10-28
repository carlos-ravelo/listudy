const assert = require('assert').strict;
const fs = require('fs');
const vm = require('vm');
const model = vm.createContext({require});
vm.runInContext(fs.readFileSync('assets/js/modules/pgn/download_pgn.js', 'utf8').replace(/^export /gm, ''), model);
vm.runInContext(fs.readFileSync('assets/js/modules/study/lichess_analysis.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), model);
vm.runInContext(fs.readFileSync('assets/js/modules/study/chapter_editor.js', 'utf8').replace('export function', 'function'), model);
let factory;
const ground = { state: { orientation: 'white' }, set() {}, destroy() {} };
const context = vm.createContext({ hasBlockingUi: () => false, require, URLSearchParams, Map,
    createChapterEditor: model.createChapterEditor,
    lichessAnalysisUrl: model.lichessAnalysisUrl, prepareLichessAnalysis: model.prepareLichessAnalysis,
    createPromotionPicker: () => ({open() {}, close() {}, destroy() {}}),
    window: { location: { search: '' } },
    Alpine: { data(_, value) { factory = value; }, start() {} },
    Chessground(_, options) { ground.state.orientation = options.orientation; return ground; },
    setupStudyMoveTree() { return { update() {} }; }, ground_legal_moves() { return new Map(); }
});
vm.runInContext(fs.readFileSync('assets/js/modules/board/board_interaction.js', 'utf8').replace(/^export /gm, ''), context);
vm.runInContext(fs.readFileSync('assets/js/modules/board/promotion_controller.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
vm.runInContext(fs.readFileSync('assets/js/pages/study/study_editor.js', 'utf8').replace(/^import .*;\n/gm, ''), context);
function editor(fen, color = 'white') {
    const controller = factory();
    controller.$el = { dataset: { color, editor: JSON.stringify({ chapters: [{ title: 'Promotion', fen, comment: '', root: [] }] }) } };
    controller.$refs = { promotionPicker: {}, board: { focus() {} }, moves: {}, promotionChoices: { querySelector() { return { focus() {} }; } } };
    controller.$nextTick = callback => callback();
    controller.init();
    return controller;
}
for (const [role, san] of [['q', 'a8=Q+'], ['r', 'a8=R+'], ['b', 'a8=B'], ['n', 'a8=N']]) {
    const controller = editor('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const before = controller.exportPgn;
    controller.play('a7', 'a8');
    assert.ok(controller.pendingPromotion);
    assert.equal(controller.dirty, false);
    assert.equal(controller.exportPgn, before, 'no move is committed before the choice');
    controller.next();
    assert.equal(controller.dirty, false);
    controller.choosePromotion(role);
    assert.equal(controller.pendingPromotion, null);
    assert.ok(controller.exportPgn.includes(san));
    assert.equal(controller.dirty, true);
}
const black = editor('4k3/8/8/8/8/8/p7/4K3 b - - 0 1', 'black');
black.play('a2', 'a1');
black.cancelPromotion();
assert.equal(black.pendingPromotion, null);
assert.equal(black.dirty, false);
black.play('a2', 'a1');
black.choosePromotion('n');
assert.ok(black.exportPgn.includes('a1=N'));
const ordinary = editor('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
ordinary.play('e2', 'e4');
assert.equal(ordinary.pendingPromotion, null);
assert.ok(ordinary.exportPgn.includes('e4'));
console.log('Chapter promotion checks passed.');
