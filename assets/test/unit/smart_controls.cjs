const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../js/modules/study_page_controls.js'), 'utf8');
const listeners = {};
const storage = {};
const nodes = Object.fromEntries(['puzzle_run', 'practice_smart', 'practice_lines', 'line_order_control', 'stop_smart_run'].map(id => [id, { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }]));
let changes = 0;
const context = vm.createContext({
    document: { getElementById: id => nodes[id] },
    localStorage: { getItem: key => storage[key], setItem: (key, value) => storage[key] = value },
    window: { addEventListener: (type, callback) => listeners[type] = callback, dispatchEvent: () => changes++ },
    Event: class {}
});
vm.runInContext(source.slice(source.indexOf('export function setupPuzzleRun')).replace(/^export /gm, ''), context);
context.setupPuzzleRun({});
assert.equal(context.window.studyFullLines, true);
nodes.practice_smart.onclick();
assert.equal(storage.puzzleRunMode, 'smart');
assert.equal(nodes.practice_smart.attributes['aria-pressed'], 'true');
assert.equal(nodes.line_order_control.hidden, true);
nodes.practice_smart.onclick();
assert.equal(changes, 1);
nodes.practice_lines.onclick();
assert.equal(storage.puzzleRunMode, 'off');
nodes.puzzle_run.value = 'random';
nodes.puzzle_run.onchange();
assert.equal(storage.puzzleRunMode, 'random');
nodes.practice_smart.onclick();
nodes.practice_lines.onclick();
assert.equal(storage.puzzleRunMode, 'random');
listeners['study-reading-updated']({ detail: { reading: true } });
assert.equal(nodes.practice_smart.disabled, true);
assert.equal(nodes.line_order_control.hidden, true);
listeners['study-reading-updated']({ detail: { reading: false } });
nodes.practice_smart.onclick();
nodes.stop_smart_run.onclick();
assert.equal(storage.puzzleRunMode, 'off');
storage.puzzleRunMode = 'smart';
context.setupPuzzleRun({});
assert.equal(nodes.practice_smart.attributes['aria-pressed'], 'true');
listeners['study-puzzle-run-off']();
assert.equal(storage.puzzleRunMode, 'off');
assert.equal(context.window.studyFullLines, true);
console.log('Session choices, order persistence, reading and stopping passed');
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
    scopedPracticeCatalog: () => [],
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
