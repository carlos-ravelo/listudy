const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ ...require('ts-fsrs'), ChessModule: require('chess.js') });
for (const file of ['review_history.js', 'position_review.js', 'learning_progress.js', 'progress_merge.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study', file), 'utf8')
        .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, ''), context);
}
const { positionReviews, introduceContinuation, scheduledReviews, nextSmartPosition,
    recordPositionReview, recordContinuationReview, chapterLearningProgress, mergeProgress } = context;
const now = new Date('2026-10-15T12:00:00Z');
const stats = { chapters: {}, chapterIds: ['stable'] };
const cards = positionReviews(stats, 0, 'a');
const item = { chapter: 0, id: '', path: [], expected: ['e4'], choices: [{ move: 'e4', children: [] }] };
const taught = introduceContinuation(cards, '', 'e4', now);
assert.equal(taught.card.reps, 0);
assert.equal(taught.card.lapses, 0);
assert.equal(taught.successes, 0);
assert.equal(taught.history.length, 0);
assert.equal(new Date(taught.card.due).getTime(), now.getTime() + 60000);
assert.equal(stats.chapters.stable.errors, 0);
assert.equal(stats.chapters.stable.attempts, 0);
assert.equal(stats.chapters.stable.coveredMoves, undefined);
assert.equal(stats.chapters.stable.failedPositions, undefined);
assert.equal(scheduledReviews(stats, 'a', item).length, 1);
assert.equal(chapterLearningProgress(stats, 0, 'a', [item], now).newContinuations, 0);
assert.equal(chapterLearningProgress(stats, 0, 'a', [item], now).recallAccuracy, null);
assert.equal(nextSmartPosition(stats, ['a'], [item], { newCount: 10 }, now).target, null);
const due = new Date(taught.card.due);
const target = nextSmartPosition(stats, ['a'], [item], { newCount: 10 }, due).target;
assert.equal(target.type, 'position');
assert.equal(target.expectedMove, 'e4');
assert.equal(target.urgent, false, 'A guided introduction is not a failed review');

const base = JSON.parse(JSON.stringify(stats));
const parentReview = recordPositionReview(cards, '', true, false, new Set(), due);
recordContinuationReview(cards, '', 'e4', true, false, true, false, parentReview.card, due);
assert.equal(cards[''].moveReviews.e4.card.reps, 1);
assert.equal(cards[''].moveReviews.e4.successes, 1);
assert.equal(cards[''].moveReviews.e4.history.length, 1);
assert.equal(chapterLearningProgress(stats, 0, 'a', [item], due).recallAccuracy, 100);
assert.equal(chapterLearningProgress(stats, 0, 'a', [item], due).recallSamples, 1);

const parentSnapshot = JSON.stringify(cards[''].card);
const firstSnapshot = JSON.stringify(cards[''].moveReviews.e4);
introduceContinuation(cards, '', 'd4', due);
introduceContinuation(cards, '', 'e4', due);
assert.equal(JSON.stringify(cards[''].card), parentSnapshot);
assert.equal(JSON.stringify(cards[''].moveReviews.e4), firstSnapshot);
assert.equal(cards[''].introducedMoves.join(','), 'e4,d4');

const remote = JSON.parse(JSON.stringify(base));
introduceContinuation(remote.chapters.stable.positionReviews.cards, '', 'c4', due);
const merged = mergeProgress(base, stats, remote, 'study_chapter_stats');
const mergedCards = merged.chapters.stable.positionReviews.cards;
assert.equal(mergedCards[''].moveReviews.e4.card.reps, 1);
assert.equal(mergedCards[''].moveReviews.e4.introducedAt, now.toISOString());
assert.equal(mergedCards[''].moveReviews.c4.card.reps, 0);
assert.equal(mergedCards[''].moveReviews.d4.card.reps, 0);
assert.equal(merged.chapters.stable.attempts, 0);

const restored = JSON.parse(JSON.stringify(stats));
assert.equal(chapterLearningProgress(restored, 0, 'a', [item], due).recallAccuracy, 100);
const response = restored.chapters.stable.positionReviews.cards[''].moveReviews.d4;
recordContinuationReview(restored.chapters.stable.positionReviews.cards, '', 'd4', true, true, true, false, null, new Date(response.card.due));
assert.equal(restored.chapters.stable.positionReviews.cards[''].moveReviews.d4.recovered, false);
console.log('Ungraded introductions, learning schedules, first recall, assisted reviews and sync conservation passed');
