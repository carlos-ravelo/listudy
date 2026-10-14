const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../js/modules/study_page_controls.js'), 'utf8');
const listeners = {};
const storage = {};
const button = {};
const context = vm.createContext({
    document: { getElementById: () => button },
    localStorage: { getItem: key => storage[key], setItem: (key, value) => storage[key] = value },
    window: { addEventListener: (type, callback) => listeners[type] = callback, dispatchEvent: () => {} },
    Event: class {}
});
vm.runInContext(source.slice(source.indexOf('export function setupPuzzleRun')).replace('export ', ''), context);
const i18n = Object.fromEntries(['off', 'next', 'random', 'smart'].map(mode => [`puzzle_run_${mode}`, mode]));
context.setupPuzzleRun(i18n);
for (const mode of ['next', 'random', 'smart', 'off']) {
    button.onclick({ preventDefault() {} });
    assert.equal(button.textContent, mode);
    assert.equal(storage.puzzleRunMode, mode);
}
storage.puzzleRunMode = 'smart';
context.setupPuzzleRun(i18n);
assert.equal(button.textContent, 'smart');
listeners['study-puzzle-run-off']();
assert.equal(storage.puzzleRunMode, 'off');
assert.equal(button.textContent, 'off');
console.log('Smart mode cycle, restoration and cancellation passed');
const study = fs.readFileSync(require('node:path').join(__dirname, '../../js/study.js'), 'utf8');
const state = { smartSession: { newCount: 2 }, smartTarget: null, chapterStats: {}, chapterReviewSignatures: [],
    smartCatalog: [], chapter: 0, trees: [{ root: [], headers: {} }], color: 'white',
    trainingSessionId: 1, lineEligibleForReview: true, selected: null, completed: 0 };
const status = {};
const select = { value: '0', dispatchEvent(event) { state.selected = event.detail; } };
const smartContext = vm.createContext({ ...state,
    localStorage: { getItem: () => 'smart' },
    document: { getElementById: id => id === 'chapter_select' ? select : status },
    CustomEvent: class { constructor(type, options) { this.detail = options.detail; } },
    nextSmartPosition: () => ({ target: { chapter: 0, path: [0], type: 'line' } }),
    readChapterPosition: () => ({ fen: () => 'context position' }),
    positionReviews: () => ({}),
    presentPracticePosition(path, count) {
        smartContext.curr_move = [smartContext.chapter, ...path];
        smartContext.lineEligibleForReview = false;
        state.replayCount = count;
    },
    updateContextReplayUi() {},
    ground_init_state() {}, setup_move() {}, finish_chapter_practice: () => state.completed++,
    ground: { set() {} }, i18n: { smart_learning: 'new', smart_complete: 'done', spaced_review_next: 'next' }
});
smartContext.window = smartContext;
vm.runInContext(study.slice(study.indexOf('function selectNextSmartPosition()'), study.indexOf('function updateSmartRun()')), smartContext);
smartContext.selectNextSmartPosition();
assert.equal(state.selected.smartRun, true);
assert.equal(smartContext.curr_move.join(','), '0,0');
assert.equal(smartContext.lineEligibleForReview, false);
assert.equal(state.replayCount, 4);
smartContext.nextSmartPosition = () => ({ target: { chapter: 0, id: 'known', path: [0], type: 'position' } });
smartContext.positionReviews = () => ({ known: { recovered: true } });
smartContext.selectNextSmartPosition();
assert.equal(state.replayCount, 0);
smartContext.nextSmartPosition = () => ({ target: null, nextDue: new Date('2026-10-15').getTime() });
smartContext.selectNextSmartPosition();
assert.equal(smartContext.trainingSessionId, 2);
assert.equal(state.completed, 1);
assert(status.textContent.includes('done'));
assert(status.textContent.includes('next'));
