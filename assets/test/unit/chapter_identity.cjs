const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ ...require('ts-fsrs') });
const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study', file), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, ''), context);
load('chapter_stats.js');
load('chapter_review.js');
const { bindChapterIdentities, chapterWeakness, recordChapterAttempt, readChapterStats,
    emptyChapterReviews, recordLineReview, chapterReviewStatus } = context;
const a = { headers: { ListudyChapterId: 'a'.repeat(32), ListudyOriginalIndex: '0' } };
const b = { headers: { ListudyChapterId: 'b'.repeat(32), ListudyOriginalIndex: '1' } };
const copy = { headers: { ListudyChapterId: 'c'.repeat(32) } };
const stats = readChapterStats(JSON.stringify({ version: 1, chapters: {
    0: { attempts: 10, errors: 2 }, 1: { attempts: 12, errors: 7 }
} }));
bindChapterIdentities(stats, [b, a]);
assert.equal(chapterWeakness(stats, 0).errors, 7);
assert.equal(chapterWeakness(stats, 1).errors, 2);
assert.equal(stats.chapters['0'], undefined);
bindChapterIdentities(stats, [copy, a, b]);
assert.equal(chapterWeakness(stats, 0).errors, 0);
recordChapterAttempt(stats, 0, false);
assert.equal(chapterWeakness(stats, 1).errors, 2);
assert.equal(chapterWeakness(stats, 2).errors, 7);
bindChapterIdentities(stats, [b]);
assert.equal(chapterWeakness(stats, 0).errors, 7);
const reviews = emptyChapterReviews();
recordLineReview(reviews, 0, 'signature-a', true);
recordLineReview(reviews, 1, 'signature-b', false);
const dueA = chapterReviewStatus(reviews, 0, 'signature-a').dueAt.getTime();
const dueB = chapterReviewStatus(reviews, 1, 'signature-b').dueAt.getTime();
bindChapterIdentities(reviews, [b, a, copy]);
assert.equal(chapterReviewStatus(reviews, 0, 'signature-b').dueAt.getTime(), dueB);
assert.equal(chapterReviewStatus(reviews, 1, 'signature-a').dueAt.getTime(), dueA);
assert.equal(chapterReviewStatus(reviews, 2, 'signature-a').dueAt, null);
assert.equal(chapterReviewStatus(reviews, 0, 'edited-signature').dueAt, null);
console.log('Chapter identity and progress migration checks passed.');
