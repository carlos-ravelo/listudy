const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ ...require('ts-fsrs'), ChessModule: require('chess.js') });
for (const file of ['study/review_history.js', 'study/position_review.js', 'study/chapter_stats.js', 'study/failed_positions.js', 'study/progress_merge.js', 'analysis/game_progress.js']) {
    vm.runInContext('{\n' + fs.readFileSync(path.join(__dirname, '../../js/modules', file), 'utf8')
        .replace(/^import .*\n/gm, '').replace(/export \{([^}]+)\};/g, 'Object.assign(globalThis, {$1});') + '\n}', context);
}
const { positionCatalog, applyGameEvidence, recordGamePractice, nextSmartPosition, gamePositionPending,
    gamePositionKey, gameLineTarget, mergeProgress } = context;
const now = new Date('2026-10-15T12:00:00Z');
const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3'];
const root = moves.reduceRight((children, move) => [{ move, children }], []);
const catalog = positionCatalog([{ headers: {}, root }], 'white');
const item = catalog[1];
const stats = { version: 1, chapters: {} };
const mistake = { fen: item.fen, expected: 'Nf3', last_played_at: '2026-10-15T11:00:00Z', latest_game_id: 4 };
let result = applyGameEvidence(stats, ['a'], catalog, [mistake], now);
assert.equal(result.changed, true);
assert.equal(result.references.get(mistake).id, item.id);
let review = stats.chapters[0].positionReviews.cards[item.id];
assert.equal(review.card.reps, 0, 'A played game does not fabricate a graded practice attempt');
assert.equal(review.history.length, 0);
assert.equal(stats.chapters[0].attempts, 0);
assert.equal(stats.chapters[0].coveredMoves, undefined);
assert.equal(review.introducedMoves, undefined);
assert.equal(nextSmartPosition(stats, ['a'], catalog, { newCount: 0 }, now).target.id, item.id);
assert.equal(applyGameEvidence(stats, ['a'], catalog, [mistake], now).changed, false, 'Reopening does not schedule the same evidence again');
assert.equal(gamePositionPending(stats, mistake, now), true);
assert.equal(recordGamePractice(stats, ['a'], item, 'Nf3', true, false, new Set(), now), true);
assert.equal(review.gameEvidence.pending, true, 'The replaced snapshot stays immutable');
review = stats.chapters[0].positionReviews.cards[item.id];
assert.equal(review.gameEvidence.pending, false);
assert.equal(gamePositionPending(stats, mistake, now), false);
assert.equal(stats.chapters[0].coveredMoves.length, 1);
const snapshot = JSON.stringify(stats);
assert.equal(applyGameEvidence(stats, ['a'], catalog, [mistake], new Date(now.getTime() + 300000)).changed, false);
assert.equal(JSON.stringify(stats), snapshot, 'A recalled game position retains its FSRS schedule');

const after = new Date(now.getTime() + 3600000);
const fresh = { ...mistake, last_played_at: after.toISOString(), latest_game_id: 5 };
assert.equal(applyGameEvidence(stats, ['a'], catalog, [fresh], after).changed, true);
assert.equal(gamePositionPending(stats, fresh, after), true);
assert.equal(stats.chapters[0].positionReviews.cards[item.id].card.reps, review.card.reps);
const attempted = new Set();
recordGamePractice(stats, ['a'], item, 'd4', false, false, attempted, after);
recordGamePractice(stats, ['a'], item, 'Nf3', true, true, attempted, after);
assert.equal(stats.chapters[0].positionReviews.cards[item.id].gameEvidence.pending, true, 'A corrected attempt is not an independent recall');
assert.equal(gamePositionPending(stats, fresh, after), true);
assert.equal(applyGameEvidence(stats, ['a'], catalog, [{ ...fresh, expected: 'd4' }], after).references.size, 0, 'Stale answers are not mapped to a different continuation');

const duplicate = positionCatalog([{ headers: {}, root }, { headers: {}, root }], 'white');
const dedup = { chapters: {} };
applyGameEvidence(dedup, ['a', 'a'], duplicate, [mistake], now);
assert.equal(Object.keys(dedup.chapters).length, 1, 'One game observation does not create cards in duplicate chapters');
assert.equal(gamePositionKey(catalog[0].fen), gamePositionKey(catalog[0].fen.split(' ').slice(0, 4).join(' ')));
assert.equal(gamePositionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'),
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -');
const target = gameLineTarget(catalog, mistake.fen, mistake.expected, 0);
assert.equal(target.path.length, 0, 'A line exercise includes the lead-in to the problem');
assert.equal(target.route.length, 7);
assert.equal(target.completeLine, true);
assert.equal(gameLineTarget(catalog, mistake.fen, 'd4', 0), null);

const base = JSON.parse(snapshot);
const local = JSON.parse(snapshot);
applyGameEvidence(local, ['a'], catalog, [fresh], after);
const merged = mergeProgress(base, local, base, 'study_chapter_stats');
assert.equal(merged.chapters[0].positionReviews.cards[item.id].gameEvidence.pending, true);
assert.equal(new Date(merged.chapters[0].positionReviews.cards[item.id].card.due).getTime() <= after.getTime(), true);

const concurrentBase = JSON.parse(snapshot);
concurrentBase.chapters[0].positionReviews.cards[item.id].card.due = new Date(after.getTime() + 3600000).toISOString();
const recalled = JSON.parse(JSON.stringify(concurrentBase));
applyGameEvidence(recalled, ['a'], catalog, [fresh], after);
recordGamePractice(recalled, ['a'], item, 'Nf3', true, false, new Set(), new Date(after.getTime() + 120000));
const otherDevice = JSON.parse(JSON.stringify(concurrentBase));
otherDevice.chapters[0].positionReviews.cards[item.id].introducedMoves.push('Nf3');
const combined = mergeProgress(concurrentBase, recalled, otherDevice, 'study_chapter_stats');
assert.equal(combined.chapters[0].positionReviews.cards[item.id].recovered, true, 'Concurrent replay applies game evidence before a later actual recall');
assert.equal(combined.chapters[0].positionReviews.cards[item.id].gameEvidence.pending, false);
const laterGame = { ...fresh, latest_game_id: 6, last_played_at: new Date(after.getTime() + 240000).toISOString() };
const observed = JSON.parse(JSON.stringify(concurrentBase));
applyGameEvidence(observed, ['a'], catalog, [laterGame], new Date(after.getTime() + 300000));
const reopened = mergeProgress(concurrentBase, recalled, observed, 'study_chapter_stats');
assert.equal(reopened.chapters[0].positionReviews.cards[item.id].gameEvidence.pending, true, 'A newer played-game departure survives a concurrent older practice result');

const retired = { chapters: {} };
applyGameEvidence(retired, ['a'], catalog, [mistake], now);
applyGameEvidence(retired, ['a'], catalog, [], now, true);
assert.equal(retired.chapters[0].positionReviews.cards[item.id], undefined, 'Retired game-only observations do not leave artificial new cards');
const preserved = JSON.parse(JSON.stringify(concurrentBase));
const dueBeforeGame = preserved.chapters[0].positionReviews.cards[item.id].card.due;
applyGameEvidence(preserved, ['a'], catalog, [fresh], after);
applyGameEvidence(preserved, ['a'], catalog, [], after, true);
assert.equal(new Date(preserved.chapters[0].positionReviews.cards[item.id].card.due).getTime(), new Date(dueBeforeGame).getTime(), 'Removing an obsolete game observation restores the earned schedule');
assert.equal(preserved.chapters[0].positionReviews.cards[item.id].recovered, true);
const actualPractice = JSON.parse(JSON.stringify(recalled));
const earned = actualPractice.chapters[0].positionReviews.cards[item.id].card.due;
applyGameEvidence(actualPractice, ['a'], catalog, [], after, true);
assert.equal(actualPractice.chapters[0].positionReviews.cards[item.id].card.due, earned, 'Retiring an observation keeps actual subsequent FSRS practice');

let chessConstructions = 0;
const NativeChess = require('chess.js').Chess;
const counting = vm.createContext({ ...context, ChessModule: { Chess: function(...args) {
    chessConstructions++;
    return new NativeChess(...args);
} } });
vm.runInContext('{\n' + fs.readFileSync(path.join(__dirname, '../../js/modules/analysis/game_progress.js'), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/export \{([^}]+)\};/g, 'Object.assign(globalThis, {$1});') + '\n}', counting);
const batch = Array.from({ length: 20 }, (_, index) => ({ ...mistake, latest_game_id: index + 1 }));
counting.applyGameEvidence({ chapters: {} }, ['a'], catalog, batch, now);
assert(chessConstructions <= catalog.length + batch.length,
    'Batch matching normalizes the catalog once instead of replaying it for every observation');
const trackedDuplicate = { chapters: { 1: { positionReviews: { signature: 'a', cards: {
    [item.id]: { gameEvidence: { at: now.getTime() + 1, gameId: 999 } }
} } } } };
const chosen = applyGameEvidence(trackedDuplicate, ['a', 'a'], duplicate, [mistake], now);
assert.equal(chosen.references.get(mistake).chapter, 1, 'Indexed matching preserves the existing evidence route across transpositions');
console.log('Game evidence, shared FSRS, coverage, recovery, deduplication and line targets passed');
