const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ ...require('ts-fsrs'), ChessModule: require('chess.js') });
for (const file of ['review_history.js', 'position_review.js', 'progress_preservation.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study', file), 'utf8').replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, ''), context);
const { positionCatalog, reconcileStudyProgress, recordPositionReview } = context;
const old = [{ headers: { ListudyChapterId: 'a' }, root: [{ move: 'e4', children: [
    { move: 'e5', children: [{ move: 'Nf3', children: [] }] },
    { move: 'c5', children: [{ move: 'Nf3', children: [] }] }
] }] }];
const edited = JSON.parse(JSON.stringify(old));
edited[0].root[0].children.reverse();
edited[0].root[0].children[1].children.push({ move: 'Bc4', children: [] });
const stats = { version: 1, chapterIds: ['a'], chapters: { a: { attempts: 4, errors: 1,
    coveredMoves: ['e4', 'e4|e5|Nf3'], cleanMoves: ['e4'], positionReviews: { signature: 'old', cards: {} },
    failedPositions: { signature: 'old', positions: {} } } } };
const catalog = positionCatalog(old, 'white');
const cards = stats.chapters.a.positionReviews.cards;
recordPositionReview(cards, 'e4|e5', false, false, new Set(), new Date('2026-10-14'));
const originalDue = cards['e4|e5'].card.due.getTime();
stats.chapters.a.failedPositions.positions['e4|e5'] = { ...catalog.find(item => item.id === 'e4|e5'), cleanStreak: 0 };
reconcileStudyProgress(stats, edited, positionCatalog(edited, 'white'), ['new'], old);
assert.equal(stats.chapters.a.positionReviews.signature, 'new');
assert.equal(new Date(stats.chapters.a.positionReviews.cards['e4|e5'].card.due).getTime(), originalDue);
assert.equal(stats.chapters.a.failedPositions.positions['e4|e5'].path.join(','), '0,1');
assert.deepEqual(Array.from(stats.chapters.a.coveredMoves), ['e4', 'e4|e5|Nf3']);
assert.equal(stats.chapters.a.attempts, 4);
const shorter = JSON.parse(JSON.stringify(edited));
shorter[0].root[0].children = [shorter[0].root[0].children[0]];
reconcileStudyProgress(stats, shorter, positionCatalog(shorter, 'white'), ['shorter']);
assert.equal(stats.chapters.a.positionReviews.cards['e4|e5'], undefined);
assert.equal(stats.chapters.a.failedPositions.positions['e4|e5'], undefined);
assert.deepEqual(Array.from(stats.chapters.a.coveredMoves), ['e4']);
const custom = [{ headers: { ListudyChapterId: 'a', FEN: '7k/8/8/8/8/8/8/K7 w - - 0 1' }, root: [{ move: 'Kb1', children: [] }] }];
reconcileStudyProgress(stats, custom, positionCatalog(custom, 'white'), ['custom']);
assert.equal(Object.keys(stats.chapters.a.positionReviews.cards).length, 0);
assert.equal(stats.chapters.a.coveredMoves.length, 0);
assert.equal(reconcileStudyProgress(stats, custom, positionCatalog(custom, 'white'), ['custom']), false);

const buildCatalog = context.positionCatalog;
const rebuilt = [];
context.positionCatalog = (trees, color) => {
    rebuilt.push(trees);
    return buildCatalog(trees, color);
};
const unchanged = { chapterIds: ['a'], chapters: { a: { positionReviews: { signature: 'same', cards: {
    'e4|e5': { card: { due: '2026-10-20' } }
} } } } };
reconcileStudyProgress(unchanged, old, catalog, ['same'], old);
assert.equal(rebuilt.length, 0, 'Unchanged reviews do not replay the old study');
assert.equal(unchanged.chapters.a.positionReviews.cards['e4|e5'].positionFen, catalog.find(item => item.id === 'e4|e5').fen.split(' ').slice(0, 4).join(' '));
const legacy = { chapterIds: ['a'], chapters: { a: { positionReviews: { signature: 'old', cards: {
    'e4|e5': { card: { due: '2026-10-20' } }
} } } } };
const unrelated = { headers: { ListudyChapterId: 'unrelated' }, root: [] };
reconcileStudyProgress(legacy, edited, buildCatalog(edited, 'white'), ['new'], [unrelated, ...old]);
assert.equal(rebuilt.length, 1, 'Legacy review migration builds only its old chapter');
assert.equal(rebuilt[0].length, 1);
assert.equal(rebuilt[0][0], old[0]);
assert.equal(legacy.chapters.a.positionReviews.cards['e4|e5'].card.due, '2026-10-20');
console.log('Chapter editing preserves valid FSRS cards, remaps branches and retires changed positions');
