const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const createPageScope = require('./page_scope_helper.cjs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../js/modules/study_page_controls.js'), 'utf8');
const listeners = {};
const storage = {};
const nodes = Object.fromEntries(['puzzle_run', 'practice_smart', 'practice_lines', 'line_order_control', 'stop_smart_run'].map(id => [id, { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }]));
let changes = 0;
const context = vm.createContext({ createPageScope,
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
assert.equal(nodes.practice_smart.disabled, false, 'Keep mode switches available while reading');
assert.equal(nodes.practice_lines.disabled, false);
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

storage.puzzleRunMode = 'smart';
storage.fullLineRunMode = 'random';
const directed = context.setupPuzzleRun({}, { initialMode: 'off' });
assert.equal(context.window.studyPuzzleRunMode, 'off');
assert.equal(context.window.studyFullLines, true);
assert.equal(nodes.practice_lines.attributes['aria-pressed'], 'true');
assert.equal(nodes.puzzle_run.value, 'off');
assert.equal(storage.puzzleRunMode, 'smart', 'A chapter link must not overwrite the default mode');
assert.equal(storage.fullLineRunMode, 'random');
const previousChanges = changes;
directed.setMode('smart', { persist: false, notify: false });
assert.equal(context.window.studyPuzzleRunMode, 'smart');
assert.equal(changes, previousChanges, 'A targeted line must not start an unrelated Smart selection');
context.setupPuzzleRun({});
assert.equal(context.window.studyPuzzleRunMode, 'smart', 'Ordinary study visits restore the saved preference');

const study = fs.readFileSync(require('node:path').join(__dirname, '../../js/pages/study/study.js'), 'utf8');
const state = { smartSession: { newCount: 2 }, smartTarget: null, chapterStats: {}, chapterReviewSignatures: [],
    smartCatalog: [], gameLineQueue: null, chapter: 0, trees: [{ root: [], headers: {} }], color: 'white',
    lineEligibleForReview: true, selected: null, completed: 0 };
const status = {};
const select = { value: '0', dispatchEvent(event) { state.selected = event.detail; } };
const smartContext = vm.createContext({ createPageScope, ...state,
    localStorage: { getItem: () => 'smart' },
    document: { getElementById: id => id === 'chapter_select' ? select : status },
    CustomEvent: class { constructor(type, options) { this.detail = options.detail; } },
    nextSmartPosition: () => ({ target: { chapter: 0, path: [0], type: 'line' } }),
    publishStudyRunStatus: (kind, message, visible = Boolean(message)) => {
        assert.equal(kind, 'smart'); status.textContent = message; status.hidden = !visible;
    },
    scopedPracticeCatalog: () => [],
    studySessions: { boundary() { return false; } },
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
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../../js/modules/board_interaction.js'), 'utf8').replace(/^export /gm, ''), smartContext);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../../js/modules/study/run_lifecycle.js'), 'utf8').replace(/^export /gm, ''), smartContext);
smartContext.studyRun = smartContext.createStudyRun({ getChapter: () => smartContext.chapter });
smartContext.studyRun.invalidate();
vm.runInContext(study.slice(study.indexOf('function selectNextSmartPosition()'), study.indexOf('function updateSmartRun(')), smartContext);
smartContext.selectNextSmartPosition();
assert.equal(state.selected.smartRun, true);
assert.equal(smartContext.curr_move.join(','), '0,0');
assert.equal(smartContext.lineEligibleForReview, false);
assert.equal(state.replayCount, 4);
smartContext.nextSmartPosition = () => ({ target: { chapter: 0, id: 'known', path: [0], type: 'position' } });
smartContext.positionReviews = () => ({ known: { recovered: true } });
smartContext.selectNextSmartPosition();
assert.equal(state.replayCount, 0);
smartContext.nextSmartPosition = () => ({ target: { chapter: 0, path: [], type: 'line', reviewChain: true, longReview: false } });
smartContext.selectNextSmartPosition();
assert.equal(status.textContent, '', 'Short review chains keep their deliberately empty status');
assert.equal(status.hidden, true);
smartContext.nextSmartPosition = () => ({ target: null, nextDue: new Date('2026-10-15').getTime() });
smartContext.selectNextSmartPosition();
assert.equal(smartContext.studyRun.revision, 2);
assert.equal(state.completed, 1);
assert(status.textContent.includes('done'));
assert(status.textContent.includes('next'));
smartContext.studySessions.boundary = () => true;
smartContext.nextSmartPosition = () => { throw new Error('A completed session must not select another target'); };
smartContext.smartTarget = { type: 'line' };
smartContext.selectNextSmartPosition();
assert.equal(smartContext.smartTarget, null);
assert.equal(smartContext.studyRun.revision, 3);
assert.equal(status.textContent, 'done');
