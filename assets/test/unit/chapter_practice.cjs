const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/chapter_stats.js'), 'utf8')
    .replace(/export \{[^}]+\};/, ''), context);
const { beginChapterPractice, finishChapterPractice, recordChapterAttempt, recentPracticePerformance, readChapterStats, chapterProgressState } = context;
const stats = readChapterStats(JSON.stringify({ version: 1, chapters: { 0: { attempts: 95, errors: 14 } } }));
assert.equal(recentPracticePerformance(stats, 0, 'pgn').accuracy, null);
assert.equal(chapterProgressState(stats, 0, new Set(['e4']), 'pgn').level, 'unrated');
beginChapterPractice(stats, 0, 'pgn', 1);
for (let i = 0; i < 10; i++) recordChapterAttempt(stats, 0, i >= 2, undefined, `position-${i}`);
assert.equal(recentPracticePerformance(stats, 0, 'pgn').active.errors, 2);
assert.equal(recentPracticePerformance(stats, 0, 'pgn').accuracy, null);
finishChapterPractice(stats, 0, true, 2);
assert.equal(recentPracticePerformance(stats, 0, 'pgn').accuracy, 80);
assert.equal(chapterProgressState(stats, 0, new Set(['e4']), 'pgn').level, 'watch');
assert.equal(recentPracticePerformance(stats, 0, 'pgn').last.errors, 2);
assert.equal(stats.chapters[0].attempts, 105);
assert.equal(stats.chapters[0].errors, 16);
beginChapterPractice(stats, 0, 'pgn', 3);
for (let i = 0; i < 3; i++) recordChapterAttempt(stats, 0, false, undefined, `position-${i}`);
finishChapterPractice(stats, 0, false, 4);
assert.equal(recentPracticePerformance(stats, 0, 'pgn').accuracy, 80);
assert.equal(recentPracticePerformance(stats, 0, 'pgn').last.completed, false);
assert.equal(recentPracticePerformance(stats, 0, 'pgn').last.errors, 3);
beginChapterPractice(stats, 0, 'pgn', 5);
finishChapterPractice(stats, 0, true, 6);
assert.equal(recentPracticePerformance(stats, 0, 'pgn').count, 1);
for (let i = 0; i < 5; i++) {
    beginChapterPractice(stats, 0, 'pgn', 7 + i);
    recordChapterAttempt(stats, 0, true, 'e4');
    finishChapterPractice(stats, 0, true, 8 + i);
}
assert.equal(recentPracticePerformance(stats, 0, 'pgn').count, 5);
assert.equal(recentPracticePerformance(stats, 0, 'pgn').accuracy, 100);
assert.equal(chapterProgressState(stats, 0, new Set(['e4']), 'pgn').level, 'solid');
assert.equal(recentPracticePerformance(stats, 0, 'edited-pgn').accuracy, null);
assert.equal(recentPracticePerformance(stats, 0, 'edited-pgn').last, null);
beginChapterPractice(stats, 1, 'other', 20);
recordChapterAttempt(stats, 1, false, undefined, 'start');
const reloaded = readChapterStats(JSON.stringify(stats));
assert.equal(reloaded.chapters[1].activePractice, undefined);
assert.equal(recentPracticePerformance(reloaded, 1, 'other').last.completed, false);
assert.equal(recentPracticePerformance(reloaded, 1, 'other').accuracy, null);
beginChapterPractice(stats, 2, 'retry');
for (let i = 0; i < 3; i++) recordChapterAttempt(stats, 2, false, null, 'start');
recordChapterAttempt(stats, 2, true, 'e4', 'start');
for (let i = 1; i < 15; i++) recordChapterAttempt(stats, 2, true, `move-${i}`, `position-${i}`);
finishChapterPractice(stats, 2, true);
const retry = recentPracticePerformance(stats, 2, 'retry');
assert.equal(retry.last.errors, 3);
assert.equal(retry.last.missedMoves, 1);
assert.equal(retry.last.testedMoves, 15);
assert.equal(retry.accuracy, 93);
assert.equal(stats.chapters[2].errors, 3);
assert.equal(retry.last.firstResults, undefined);
beginChapterPractice(stats, 2, 'retry');
recordChapterAttempt(stats, 2, true, 'e4', 'start');
finishChapterPractice(stats, 2, true);
assert.equal(recentPracticePerformance(stats, 2, 'retry').accuracy, 94);
const legacy = readChapterStats(JSON.stringify({ version: 1, chapters: { 0: {
    attempts: 16, errors: 1,
    lastPractice: { signature: 'old', completed: true, attempts: 16, errors: 1 },
    practiceSessions: [{ signature: 'old', completed: true, attempts: 16, errors: 1 }]
} } }));
assert.equal(recentPracticePerformance(legacy, 0, 'old').accuracy, null);
assert.equal(recentPracticePerformance(legacy, 0, 'old').last, null);
assert.equal(legacy.chapters[0].attempts, 16);
console.log('Chapter practice regression checks passed.');
