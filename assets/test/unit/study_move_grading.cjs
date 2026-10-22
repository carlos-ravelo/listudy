const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ ...require('ts-fsrs'), ChessModule: require('chess.js') });
for (const file of ['review_history', 'position_review', 'move_grading']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../../js/modules/study/${file}.js`), 'utf8')
        .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, '').replace(/^export /gm, ''), context);
}
function fixture(overrides = {}) {
    const decisions = [];
    const args = { stats: { version: 1, chapterIds: ['stable'], chapters: {} }, chapter: 0, signature: 'signature',
        positionId: '', san: 'e4', possibleMoves: ['e4', 'd4'], fen: new (context.ChessModule.Chess || context.ChessModule)().fen(),
        wasCorrect: true, introduction: null, intendedMove: 'e4', session: null, presentation: 7,
        attempts: new Set(), assisted: false, metrics: { decision: (...values) => decisions.push(values) }, kind: 'lines', ...overrides };
    return { args, decisions, grade: () => context.gradeStudyMove(args), cards: () => args.stats.chapters.stable.positionReviews.cards };
}
const introduction = fixture({ introduction: 'e4', session: { newCount: 0, reviewStreak: 2, presentation: 4 }, kind: 'smart' });
introduction.grade();
assert.equal(introduction.args.session.newCount, 1);
assert.equal(introduction.args.session.reviewStreak, 0);
assert.equal(introduction.args.attempts.size, 0, 'Introductions do not become graded recall attempts');
assert.equal(introduction.cards()[''].history.length, 0);
assert.equal(introduction.cards()[''].moveReviews.e4.card.reps, 0);
assert.deepEqual(introduction.decisions, [['smart', '4|0|', true, true, true]]);
assert.equal(introduction.cards()[''].positionFen.split(' ').length, 4);
const clean = fixture();
const cleanResult = clean.grade();
assert.equal(cleanResult.recovery.recovered, true);
assert.equal(clean.cards()[''].moveReviews.e4.history.at(-1).rating, 3);
assert(clean.cards()[''].introducedMoves.includes('e4'));
assert.deepEqual(clean.decisions, [['lines', '7|0|', false, true, false]]);
const beforeRepeat = JSON.stringify(clean.cards());
clean.grade();
assert.equal(JSON.stringify(clean.cards()), beforeRepeat, 'A repeated attempt does not grade or schedule the position twice');
assert.equal(clean.decisions.length, 1);
const early = fixture(); early.grade();
early.cards()[''].card.due = new Date('2099-01-01T00:00:00Z');
early.cards()[''].moveReviews.e4.card.due = new Date('2099-01-01T00:00:00Z');
const beforeEarly = JSON.stringify(early.cards());
fixture({ stats: early.args.stats }).grade();
assert.equal(JSON.stringify(early.cards()), beforeEarly, 'Early clean practice preserves existing intervals and memory strength');
const assisted = fixture({ assisted: true, kind: 'positions' });
assert.equal(assisted.grade().recovery.recovered, false);
assert.equal(assisted.cards()[''].moveReviews.e4.history.at(-1).rating, 1, 'Hints still grade as misses');
const wrong = fixture({ wasCorrect: false, san: 'c4' });
assert.equal(wrong.grade().recovery.recovered, false);
assert(!wrong.cards()[''].introducedMoves?.includes('c4'));
const smart = fixture({ session: { newCount: 0, reviewCount: 0, reviewStreak: 0 }, target: { type: 'line', reviewChain: false }, kind: 'smart' });
smart.grade();
assert.equal(smart.args.session.newCount, 1);
assert.equal(smart.args.session.testedContinuations.size, 1);
assert.equal(smart.args.session.recalledOpenings.size, 1);
const shared = fixture({ stats: clean.args.stats, intendedMove: 'd4', san: 'd4', wasCorrect: false });
shared.grade();
const final = fixture({ stats: clean.args.stats });
assert.equal(final.grade().recovery.recovered, false, 'An unresolved sibling continuation prevents premature position recovery');
console.log('Study move grading: introductions, clean/assisted/wrong attempts, deduplication, Smart counters and sibling recovery passed');
