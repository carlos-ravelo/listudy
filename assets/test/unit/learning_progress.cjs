const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/learning_progress.js'), 'utf8')
    .replace(/export \{[^}]+\};/, ''), context);
const summarize = context.chapterLearningProgress;
const now = new Date('2026-10-15T12:00:00Z');
const catalog = [{ chapter: 0, id: '', expected: ['e4', 'd4'] },
    { chapter: 1, id: '', expected: ['c4'] }];
const stats = { chapterIds: ['stable', 'other'], chapters: { stable: {
    coveredMoves: ['e4', 'd4'],
    positionReviews: { signature: 'a', cards: {} }
} } };
const snapshot = () => JSON.stringify(stats);
const before = snapshot();
let progress = summarize(stats, 0, 'a', catalog, now);
assert.equal(progress.newContinuations, 0);
assert.equal(progress.recallAccuracy, null, 'Complete coverage is not evidence of recall');
assert.equal(progress.recallSamples, 0);
assert.equal(snapshot(), before, 'Rendering progress must not mutate stored data');

const event = (id, rating, at = '2026-10-14T12:00:00Z') => ({ id, rating, at });
const cards = stats.chapters.stable.positionReviews.cards;
cards[''] = { introducedMoves: ['e4', 'd4'], moveReviews: {
    e4: { card: { due: now.toISOString() }, history: [event('initial-e4', 3), event('miss', 1)] },
    d4: { card: { due: '2026-10-16T12:00:00Z' }, history: [event('initial-d4', 3), event('good', 3)] }
} };
progress = summarize(stats, 0, 'a', catalog, now);
assert.equal(progress.newContinuations, 0);
assert.equal(progress.dueContinuations, 1);
assert.equal(progress.recallAccuracy, 50);
assert.equal(progress.recallSamples, 2);

cards[''].moveReviews.e4.history.push(event('future', 3, '2026-10-16T12:00:00Z'));
assert.equal(summarize(stats, 0, 'a', catalog, now).recallSamples, 2);
assert.equal(summarize(stats, 0, 'edited', catalog, now).recallSamples, 0);
assert.equal(summarize(stats, 1, 'a', catalog, now).newContinuations, 1);
assert.equal(summarize(stats, 0, 'a', [{ chapter: 0, id: '', expected: ['d4'] }], now).dueContinuations, 0);

cards[''].moveReviews.e4.history = [event('initial', 3), ...Array.from({ length: 25 }, (_, i) =>
    event('review-' + i, i < 5 ? 1 : 3, new Date(now.getTime() - (25 - i) * 60000).toISOString()))];
cards[''].moveReviews.d4.history = [];
progress = summarize(stats, 0, 'a', catalog, now);
assert.equal(progress.recallSamples, 20);
assert.equal(progress.recallAccuracy, 100);

// A legacy position card shared by two responses contributes each event only once.
cards[''] = { card: { due: now.toISOString() }, history: [event('initial', 3), event('shared', 1)] };
assert.equal(summarize(stats, 0, 'a', catalog, now).recallSamples, 1);
stats.chapters.stable.coveredMoves = ['e4'];
assert.equal(summarize(stats, 0, 'a', catalog, now).newContinuations, 1);
console.log('Coverage, recall samples, due continuations, chapter identities and legacy histories passed');
