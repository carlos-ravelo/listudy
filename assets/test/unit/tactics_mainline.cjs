const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pgnParser = require('pgn-parser');
const context = vm.createContext({ require, ...require('ts-fsrs'), ChessModule: require('chess.js'), console: { log() {} } });
for (const file of ['tree.js', 'tree_from_pgn.js', 'study/tactics_mainline.js', 'study/chapter_stats.js',
    'study/review_history.js', 'study/position_review.js', 'study/position_catalog_cache.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules', file), 'utf8')
        .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, '').replace(/^export /gm, ''), context);
}
const source = `[Event "Calculation example"]
[SetUp "1"]
[FEN "r2qkb1r/1p2nppp/2n1b3/1N1p4/3P1B2/5N2/PP3PPP/R2QR1K1 w kq - 0 14"]
14. Bc7 { A forcing move. } (14. Nc7+ { A bad idea. } Kd7 15. Nxa8 $2 Qxa8)
14... Qd7 (14... Qc8 15. Nd6+) 15. Nd6+ *`;
function parse(pgn) {
    const parsed = pgnParser.parse('[Event "Test"]\n' + pgn);
    context.annotate_pgn(parsed);
    return context.generate_move_trees(parsed);
}
const reading = parse(source);
const original = JSON.stringify(reading);
const practice = context.tacticsMainline(reading, 'white');
const catalog = context.positionCatalog(practice, 'white');
assert.equal(JSON.stringify(catalog.map(item => item.expected)), '[["Bc7"],["Nd6+"]]');
assert.equal(JSON.stringify(catalog.map(item => item.path)), '[[],[0,0]]');
assert.equal(practice[0].root.length, 1);
assert.equal(practice[0].root[0].children.length, 1);
assert.equal(JSON.stringify(reading), original, 'Practice must preserve every source variation and comment');
assert.equal(reading[0].root.length, 2);
assert.equal(reading[0].root[0].children.length, 2);
assert.equal(reading[0].root[1].children[0].children[0].nags[0], 2);
const readingContext = vm.createContext({ require });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/study_move_tree.js'), 'utf8')
    .replace(/^export /gm, ''), readingContext);
const rendered = readingContext.chapterMoveLines(reading[0].root, reading[0].headers.FEN);
assert.equal(rendered.variations[0].moves[2].san, 'Nxa8?');
const moves = context.chapterMoveCatalog(practice[0].root, true);
const stats = { chapters: {} };
context.recordChapterAttempt(stats, 0, true, 'Bc7');
assert.equal(context.chapterCoverage(stats, 0, moves).percent, 50);
context.recordChapterAttempt(stats, 0, true, 'Bc7|Qd7|Nd6+');
assert.equal(context.chapterCoverage(stats, 0, moves).percent, 100);
assert.equal(moves.size, 2, 'Illustrative and defensive sidelines must not inflate progress');

for (const annotation of ['?', '??', '?!', ' $2', ' $4', ' $6']) {
    const trees = parse(`1. e4 e5 2. Nf3${annotation} Nc6 *`);
    const filtered = context.tacticsMainline(trees, 'white');
    assert.equal(context.chapterMoveCatalog(filtered[0].root, true).size, 1, annotation);
    assert.equal(filtered[0].root[0].children[0].children.length, 0, annotation);
    const rivalError = context.tacticsMainline(parse(`1. e4 e5${annotation} 2. Nf3 *`), 'white');
    assert.equal(context.chapterMoveCatalog(rivalError[0].root, true).size, 2, 'Keep opponent errors to practice their punishment');
    const firstError = context.tacticsMainline(parse(`1. e4${annotation} e5 *`), 'white');
    assert.equal(firstError[0].root.length, 0, 'Never require a marked error as the first answer');
}
for (const annotation of ['!', '!!', '!?', ' $1', ' $3', ' $5']) {
    const trees = context.tacticsMainline(parse(`1. e4${annotation} e5 2. Nf3 *`), 'white');
    assert.equal(context.chapterMoveCatalog(trees[0].root, true).size, 2, annotation);
}
const black = context.tacticsMainline(parse('1. e4? e5 2. Nf3 Nc6? *'), 'black');
assert.equal(JSON.stringify(context.positionCatalog(black, 'black').map(item => item.expected)), '[["e5"]]');
const customBlack = context.tacticsMainline(parse(`[FEN "7k/8/8/8/8/8/8/K7 b - - 0 1"]
1... Kg8? 2. Kb1 *`), 'white');
assert.equal(customBlack[0].root.length, 0, 'Custom positions train the side to move');

// A previously cached full tree cannot supply sideline positions to tactics practice.
const memory = new Map();
const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
const full = context.cachedPositionCatalog(reading, 'white', source, storage);
const main = context.cachedPositionCatalog(practice, 'white', 'tactics-mainline-v1|' + source, storage);
assert.ok(full.length > main.length);
assert.equal(main.length, 2);
assert.equal(context.cachedPositionCatalog(practice, 'white', 'tactics-mainline-v1|' + source, storage).length, 2);
assert.equal(context.cachedPositionCatalog(reading, 'white', source, storage).length, full.length);
console.log('Tactics main line, PGN annotations, reading, progress and catalog cache passed');
