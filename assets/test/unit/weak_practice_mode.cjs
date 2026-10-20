const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../js/study.js'), 'utf8');
const functions = source.slice(source.indexOf('function selectNextWeakChapter()'), source.indexOf('function stopSpacedReviewRun()'));
for (const mode of ['chapters', 'positions']) {
    const selected = [];
    let positionStarts = 0;
    const select = { value: '', dispatchEvent() { selected.push(Number(this.value)); } };
    const context = vm.createContext({
        weakChapterRunActive: false, weakChapterQueue: [], failedPositionRun: null,
        chapterStats: {}, chapterReviewSignatures: ['a', 'b', 'c'], trees: [{}, {}, {}],
        chapterMoveCatalogs: [], spacedReviewRunActive: false,
        weakChapterOrder: () => [2, 0],
        chapterFailures: (_, index) => index === 1 ? [1, 2] : index === 0 ? [1] : [],
        pendingPositions: positions => positions,
        document: { getElementById: id => id === 'weak_practice_mode' ? { value: mode } : id === 'chapter_select' ? select : { style: {} } },
        window: { dispatchEvent() {} }, CustomEvent: function() {}, Event: function() {},
        set_read_mode() {}, stopSpacedReviewRun() {}, updateWeakChapterRunUi() {},
        startFailedPositions() { positionStarts++; }, stopWeakChapterRun() {},
        set_text() {}, start_training() {}, i18n: {}, success_div: ''
    });
    vm.runInContext(functions, context);
    context.toggleWeakChapterRun();
    assert.equal(selected[0], mode === 'positions' ? 1 : 2);
    assert.equal(positionStarts, mode === 'positions' ? 1 : 0);
    context.selectNextWeakChapter();
    assert.deepEqual(selected, mode === 'positions' ? [1, 0] : [2, 0]);
    assert.equal(positionStarts, mode === 'positions' ? 2 : 0);
}
console.log('Weak practice chapter and position modes passed');
