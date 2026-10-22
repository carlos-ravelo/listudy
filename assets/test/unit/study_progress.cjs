const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ Date, setTimeout, clearTimeout });
for (const file of ['chapter_stats', 'failed_positions', 'practice_scope', 'learning_progress', 'progress_projection', 'progress_publisher']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../../js/modules/study/${file}.js`), 'utf8')
        .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, '').replace(/^export /gm, ''), context);
}
const now = new Date('2026-10-22T12:00:00Z');
const practice = { signature: 's0', testedMoves: 2, missedMoves: 1, completed: false };
const stats = { chapterIds: ['a', 'b', 'c', 'd'], chapters: {
    a: { attempts: 3, errors: 1, coveredMoves: ['e4'], cleanMoves: [],
        practiceSessions: [practice], lastPractice: practice,
        failedPositions: { signature: 's0', positions: { missed: { recovered: false }, fixed: { recovered: true } } },
        positionReviews: { signature: 's0', cards: {
            '': { introducedMoves: ['e4'], moveReviews: { e4: {
                introducedAt: '2026-10-20T12:00:00Z', card: { due: '2026-10-22T11:00:00Z' },
                history: [{ id: 'clean', at: '2026-10-21T12:00:00Z', rating: 3 },
                    { id: 'miss', at: '2026-10-22T11:00:00Z', rating: 1 }]
            } } },
            'e4|e5': { introducedMoves: ['Nf3'], card: { due: '2026-10-20T11:00:00Z' } }
        } }
    },
    b: { attempts: 1, errors: 0, coveredMoves: ['d4'], cleanMoves: ['d4'] },
    d: { attempts: 2, errors: 2, practiceSessions: [{ signature: 's3', testedMoves: 2, missedMoves: 2 }],
        failedPositions: { signature: 'stale', positions: { old: { recovered: false } } } }
} };
const stored = { max_depth_example_0: '1', max_depth_example_0_enabled: 'true' };
const storage = { getItem: key => stored[key] ?? null };
const catalog = context.scopePositionCatalog([
    { chapter: 0, id: '', path: [], expected: ['e4'] },
    { chapter: 0, id: 'e4|e5', path: [0, 0], expected: ['Nf3'] },
    ...[1, 2, 3].map(chapter => ({ chapter, id: '', path: [], expected: ['d4'] }))
], [1, Infinity, Infinity, Infinity]);
const labels = { progress_full_coverage: 'Full coverage', progress_within_depth: 'Depth', progress_coverage: 'Coverage',
    progress_recall: 'Recall', progress_recall_unknown: 'Unknown', progress_graded_reviews: 'reviews',
    progress_new: 'New', progress_due_continuations: 'Due', progress_recent_accuracy: 'Recent accuracy',
    progress_practice: 'practice', progress_practices: 'practices', progress_last_practice: 'Last practice',
    progress_current_practice: 'Current practice', progress_moves_missed: 'moves missed', progress_incomplete: 'incomplete',
    progress_scope_help: 'Scope help', progress_coverage_help: 'Coverage help', progress_recall_help: 'Recall help',
    spaced_review_due: 'Review due', spaced_review_next: 'Next review', progress_due_short: 'due', progress_covered_short: 'covered' };
const args = { stats, storage, studyId: 'example', catalog, labels, now,
    moveCatalogs: [new Set(['e4', 'e4|e5|Nf3']), ...[1, 2, 3].map(() => new Set(['d4']))],
    signatures: ['s0', 's1', 's2', 's3'], chapterNames: ['First', 'Mastered', '<b>Unpracticed</b>', 'Mistakes'],
    currentChapter: '2', reviews: [{ due: true, dueAt: new Date(now.getTime() - 1000) },
        { due: false, dueAt: null }, { due: false, dueAt: new Date(now.getTime() + 2500) }, { due: false, dueAt: null }] };
const before = JSON.stringify(stats);
const summaries = context.projectStudyProgress(args);
assert.equal(JSON.stringify(stats), before, 'Projection does not create defaults, reset stale failures, or alter deeper schedules');
assert.deepEqual(Array.from(summaries, row => row.index), [0, 3, 2, 1], 'Due work, mastery, recent mistakes and index retain their ordering');
const first = summaries[0], unpracticed = summaries.find(row => row.index === 2);
assert.equal(first.coverageLabel, 'Depth 1: 1/1 (100%)');
assert.equal(first.fullCoverageLabel, 'Full coverage: 1/2 (50%)');
assert.equal(first.scopeComplete, true);
assert.equal(first.coverageComplete, false);
assert.equal(first.failedPositions, 1);
assert.equal(first.recallLabel, 'Recall: 50% (2 reviews)');
assert.equal(first.pendingLabel, 'New: 0 · Due: 1');
assert.equal(first.pickerTone, 'due');
assert.equal(first.metrics, 'Recent accuracy: 50% (1 practice) · Last practice: 1/2 moves missed (incomplete)');
assert(first.progressTooltip.includes('Scope help\nCoverage help'));
assert.equal(unpracticed.current, true);
assert.equal(unpracticed.name, '<b>Unpracticed</b>', 'Projection retains plain text for Alpine x-text');
assert.equal(unpracticed.recallLabel, 'Recall: Unknown');
assert.equal(unpracticed.reviewDueAt, now.getTime() + 2500);
assert.equal(summaries.find(row => row.index === 3).failedPositions, 0, 'Stale failures are not presented');
assert.equal(context.projectStudyProgress({ ...args, chapterNames: [] }).length, 0);

let time = now.getTime(), nextId = 0, after = 0, published;
const timers = new Map();
const publisher = context.createProgressPublisher({
    clock: () => new Date(time),
    project: date => [{ reviewDueAt: now.getTime() + 2500, reviewDue: date.getTime() >= now.getTime() + 2500 }],
    publish: rows => { published = rows; }, afterUpdate: () => after++,
    schedule: (callback, delay) => { timers.set(++nextId, { callback, delay }); return nextId; },
    cancel: id => timers.delete(id)
});
publisher.update();
assert.equal(timers.get(nextId).delay, 3500, 'Refresh occurs just after the earliest due date');
publisher.update();
assert.equal(timers.size, 1, 'Frequent progress updates retain only one timer');
const timer = timers.get(nextId); timers.delete(nextId);
time += timer.delay; timer.callback();
assert.equal(published[0].reviewDue, true);
assert.equal(timers.size, 0, 'Already-due chapters do not cause a refresh loop');
assert.equal(after, 3);
publisher.destroy(); publisher.update();
assert.equal(after, 3);
let delay, canceled = false;
const distant = context.createProgressPublisher({ project: () => [{ reviewDueAt: time + 3e9 }], publish() {},
    clock: () => new Date(time), schedule: (_, value) => { delay = value; return 9; }, cancel: id => { if (id === 9) canceled = true; } });
distant.update();
assert.equal(delay, 2147483647, 'Long waits stay within the browser timer limit');
distant.destroy();
assert.equal(canceled, true);
console.log('Study progress projection, scope, recall, ordering, read-only statistics and due-date refresh lifecycle passed');
