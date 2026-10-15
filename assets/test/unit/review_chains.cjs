const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ ...require('ts-fsrs'), ChessModule: require('chess.js') });
for (const file of ['review_history.js', 'position_review.js', 'practice_scope.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study', file), 'utf8')
        .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, ''), context);
}
const { positionCatalog, positionReviews, introduceContinuation, nextSmartPosition,
    reviewExposureKey, scopePositionCatalog, reviewChain } = context;
const moves = ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O',
    'Nf3', 'h6', 'Bh4', 'b6', 'Bd3', 'Bb7', 'O-O', 'Nbd7', 'Qc2', 'c5', 'Rfd1', 'Rc8', 'Rac1', 'a6', 'a3'];
const root = moves.reduceRight((children, move) => [{ move, children }], []);
const catalog = positionCatalog([{ headers: {}, root }], 'white');
const now = new Date('2026-10-15T12:00:00Z');
const future = new Date(now.getTime() + 86400000);
function learned() {
    const stats = { chapters: {} };
    const cards = positionReviews(stats, 0, 'a');
    for (const item of catalog) {
        introduceContinuation(cards, item.id, item.expected[0], now);
        for (const review of [cards[item.id], cards[item.id].moveReviews[item.expected[0]]]) {
            review.card.due = future;
            review.card.last_review = new Date(now.getTime() - 86400000);
            review.card.scheduled_days = 2;
            review.card.reps = 3;
            review.recovered = true;
        }
    }
    cards[''].moveReviews.d4.card.due = now;
    return stats;
}
let stats = learned();
let target = nextSmartPosition(stats, ['a'], catalog, { newCount: 10 }, now).target;
assert.equal(target.type, 'line');
assert.equal(target.reviewChain, true);
assert.equal(target.route.length, 9, 'A routine review contains five player decisions');
assert.equal(target.newMoves, 0);
assert.equal(target.completeLine, false);
target = nextSmartPosition(stats, ['a'], catalog, { newCount: 10, reviewChains: 3 }, now).target;
assert.equal(target.longReview, true);
assert.equal(target.route.length, 23);
assert.equal(target.completeLine, false);
target = nextSmartPosition(stats, ['a'], scopePositionCatalog(catalog, [2]), { newCount: 10, reviewChains: 3 }, now).target;
assert.equal(target.route.length, 3);
assert.equal(target.completeLine, false);

const cards = positionReviews(stats, 0, 'a');
cards[''].moveReviews.d4.recovered = false;
cards[''].moveReviews.d4.card.lapses = 2;
target = nextSmartPosition(stats, ['a'], catalog, { newCount: 10 }, now).target;
assert.equal(target.type, 'position', 'Persistent mistakes remain isolated');
cards[''].moveReviews.d4.recovered = true;
cards[''].moveReviews.d4.card.lapses = 0;
const seen = new Set([reviewExposureKey(catalog[0].fen, 'd4')]);
const snapshot = JSON.stringify(stats);
assert.equal(nextSmartPosition(stats, ['a'], catalog, { newCount: 10, recalledOpenings: seen }, now).target, null);
assert.equal(JSON.stringify(stats), snapshot, 'Session suppression does not reschedule any card');
cards[''].moveReviews.d4.card.scheduled_days = 0;
assert(nextSmartPosition(stats, ['a'], catalog, { newCount: 10, recalledOpenings: seen }, now).target,
    'Learning repetitions remain eligible');

stats = learned();
const shortened = positionReviews(stats, 0, 'a');
delete shortened[catalog[2].id];
target = nextSmartPosition(stats, ['a'], catalog, { newCount: 10 }, now).target;
assert.equal(target.route.length, 3, 'A review stops before an unintroduced decision');
assert.equal(target.completeLine, false);
assert.equal(target.reviewChain, true);

// Prefer the opponent branch containing a due continuation, rather than the first PGN branch.
const branchedRoot = [{ move: 'd4', children: [
    { move: 'd5', children: [{ move: 'c4', children: [] }] },
    { move: 'Nf6', children: [{ move: 'c4', children: [] }] }
] }];
const branches = positionCatalog([{ headers: {}, root: branchedRoot }], 'white');
const branchStats = { chapters: {} };
const branchCards = positionReviews(branchStats, 0, 'a');
for (const item of branches) {
    const review = introduceContinuation(branchCards, item.id, item.expected[0], now);
    review.card.due = item.id === 'd4|Nf6' ? now : future;
    review.card.last_review = new Date(now.getTime() - 86400000);
    review.recovered = true;
}
const anchor = { ...branches[0], expectedMove: 'd4', type: 'position' };
const due = [{ ...branches[2], expectedMove: 'c4', priority: 1, urgent: false }];
target = reviewChain(branchStats, ['a'], branches, anchor, due, {});
assert.equal(target.route.join(','), '0,1,0');
assert.equal(target.completeLine, true);

// A long check can include known lead-in moves while preserving its selected due target.
const deep = { ...catalog[6], expectedMove: catalog[6].expected[0], type: 'position' };
target = reviewChain(learned(), ['a'], catalog, deep, [{ ...deep, priority: 1, urgent: false }], { reviewChains: 3 });
assert.equal(target.path.length, 0);
assert.equal(target.reviewAnchor, deep.id);
assert(target.route.length > deep.path.length);
assert.equal(target.expectedMove, null);
console.log('Routine chains, periodic long checks, isolated failures, depth limits and session repetition bounds passed');
