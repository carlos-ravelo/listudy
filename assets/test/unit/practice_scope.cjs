const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ ...require('ts-fsrs'), ChessModule: require('chess.js') });
for (const file of ['review_history.js', 'position_review.js', 'practice_scope.js', 'chapter_stats.js', 'learning_progress.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study', file), 'utf8')
        .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, ''), context);
}
const { practiceDepthLimit, scopePositionCatalog, scopeMoveCatalog, positionCatalog,
    nextSmartPosition, positionReviews, recordPositionReview, recordIntroducedMove,
    chapterCoverage, chapterMoveCatalog, chapterLearningProgress } = context;
const preferences = { max_depth_example_0: '1', max_depth_example_0_enabled: 'true' };
const storage = { getItem: key => preferences[key] ?? null };
assert.equal(practiceDepthLimit(storage, 'example', 0), 1);
assert.equal(practiceDepthLimit(storage, 'example', 1), Infinity);
preferences.max_depth_example_0 = '-1';
assert.equal(practiceDepthLimit(storage, 'example', 0), Infinity);
preferences.max_depth_example_0 = '1';
preferences.max_depth_example_0_enabled = 'false';
assert.equal(practiceDepthLimit(storage, 'example', 0), Infinity);

const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'];
const root = moves.reduceRight((children, move) => [{ move, children }], []);
const catalog = positionCatalog([{ headers: {}, root }], 'white');
const limited = scopePositionCatalog(catalog, [1]);
assert.equal(limited.length, 1);
assert.equal(catalog.length, 4, 'The complete repertoire stays available');
const stats = { chapters: {}, chapterIds: ['stable'] };
const now = new Date('2026-10-15T12:00:00Z');
const session = { newCount: 0 };
const target = nextSmartPosition(stats, ['a'], limited, session, now).target;
assert.equal(target.route.join(','), '0');
assert.equal(target.completeLine, false, 'A depth cutoff is not a complete line');
assert.equal(target.newMoves, 1);
const targetTwo = nextSmartPosition(stats, ['a'], scopePositionCatalog(catalog, [2]), session, now).target;
assert.equal(targetTwo.route.length, 3);
assert.equal(targetTwo.completeLine, false);

const cards = positionReviews(stats, 0, 'a');
recordPositionReview(cards, '', true, false, new Set(), now);
recordIntroducedMove(cards, '', 'e4');
recordPositionReview(cards, 'e4|e5', false, false, new Set(), now);
const later = new Date(now.getTime() + 120000);
const deeperSnapshot = JSON.stringify(cards['e4|e5']);
assert.equal(nextSmartPosition(stats, ['a'], limited, { newCount: 10 }, later).target, null);
assert.equal(chapterLearningProgress(stats, 0, 'a', limited, later).dueContinuations, 0);
assert.equal(nextSmartPosition(stats, ['a'], scopePositionCatalog(catalog, [2]), { newCount: 10 }, later).target.id, 'e4|e5');
assert.equal(JSON.stringify(cards['e4|e5']), deeperSnapshot, 'Changing scope preserves deeper cards and dates');

stats.chapters.stable.coveredMoves = ['e4'];
const fullMoves = chapterMoveCatalog(root, true);
assert.equal(chapterCoverage(stats, 0, scopeMoveCatalog(fullMoves, 1)).percent, 100);
assert.equal(chapterCoverage(stats, 0, fullMoves).percent, 25);
assert.equal(scopeMoveCatalog(fullMoves, 2).size, 2);
const black = scopePositionCatalog(positionCatalog([{ headers: {}, root }], 'black'), [1]);
assert.equal(black.length, 1);
const blackTarget = nextSmartPosition({ chapters: {} }, ['a'], black, session, now).target;
assert.equal(blackTarget.route.length, 2);
assert.equal(blackTarget.completeLine, false);
const customRoot = ['Kg8', 'Kb2', 'Kf8', 'Kc3'].reduceRight((children, move) => [{ move, children }], []);
const custom = positionCatalog([{ headers: { FEN: '7k/8/8/8/8/8/8/K7 b - - 0 30' }, root: customRoot }], 'white');
assert.equal(scopePositionCatalog(custom, [1]).length, 1);
assert.equal(nextSmartPosition({ chapters: {} }, ['a'], scopePositionCatalog(custom, [1]), session, now).target.route.length, 1);
assert.equal(scopePositionCatalog([...catalog, ...catalog.map(item => ({ ...item, chapter: 1 }))], [1, Infinity]).length, 5);
console.log('Smart depth boundaries, learning chains, due filtering, preserved schedules and scoped coverage passed');
