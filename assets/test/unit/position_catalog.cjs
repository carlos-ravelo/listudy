const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Chess = require('chess.js').Chess;
const read = file => fs.readFileSync(path.join(__dirname, '../../js/modules/study', file), 'utf8');
let played = 0;
function load(limit) {
    const context = vm.createContext({ ...require('ts-fsrs'), ChessModule: { Chess: function() {
        const chess = new Chess();
        const move = chess.move;
        chess.move = (...args) => { played++; return move(...args); };
        return chess;
    } } });
    for (const file of ['review_history.js', 'position_review.js', 'position_catalog_cache.js']) {
        let source = read(file).replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, '');
        if (limit) source = source.replace('POSITION_TRANSITION_LIMIT = 4096', `POSITION_TRANSITION_LIMIT = ${limit}`);
        vm.runInContext(source, context);
    }
    return context;
}
function reference(trees, color) {
    const result = [];
    trees.forEach((tree, chapter) => {
        const chess = new Chess(tree.headers.FEN);
        if (tree.headers.FEN && !chess.load(tree.headers.FEN)) return;
        const standard = chess.fen().split(' ').slice(0, 4).join(' ') ===
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
        const player = standard ? color === 'white' ? 'w' : 'b' : chess.turn();
        function visit(nodes, path, moves) {
            if (!nodes?.length) return;
            if (chess.turn() === player) result.push({ chapter, path, id: moves.join('|'), fen: chess.fen(),
                expected: nodes.map(node => node.move), choices: nodes });
            nodes.forEach((node, index) => {
                if (!node.children?.length || !chess.move(node.move)) return;
                visit(node.children, [...path, index], [...moves, node.move]);
                chess.undo();
            });
        }
        visit(tree.root, [], []);
    });
    return result;
}
const line = moves => moves.reduceRight((children, move) => [{ move, children }], []);
const tree = (moves, FEN) => ({ headers: FEN ? { FEN } : {}, root: line(moves) });
const opening = tree(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1']);
opening.root[0].children.push(...line(['c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4']));
const fixtures = [opening, JSON.parse(JSON.stringify(opening)),
    tree(['O-O-O', 'O-O', 'Kb1'], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),
    tree(['a8=N', 'Kg7', 'Nb6'], '7k/P7/8/8/8/8/8/7K w - - 0 1'),
    tree(['exd6', 'Kh7', 'd7'], '7k/8/8/3pP3/8/8/8/7K w - d6 0 1'),
    tree(['Kg8', 'Kb1', 'Kf7'], '7k/8/8/8/8/8/8/K7 b - - 0 1'),
    tree(['Nbd2', 'Kg7', 'Ne4'], '7k/8/8/8/8/8/8/1N2KN2 w - - 0 1'),
    tree(['e4', 'e5', 'Nf3'], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 17 42'),
    tree(['e5', 'e6']), tree(['e4'], 'invalid')];
const context = load();
for (const color of ['white', 'black']) {
    const expected = JSON.stringify(reference(fixtures, color));
    assert.equal(JSON.stringify(context.positionCatalog(fixtures, color)), expected);
    assert.equal(JSON.stringify(load(2).positionCatalog(fixtures, color)), expected,
        'Reaching the transition limit must preserve every remaining branch');
}
played = 0;
context.positionCatalog([opening], 'white');
const singleMoves = played;
played = 0;
const repeats = Array.from({ length: 25 }, () => JSON.parse(JSON.stringify(opening)));
const repeated = context.positionCatalog(repeats, 'white');
assert.equal(played, singleMoves, 'Shared opening moves are validated once per catalog');
assert.equal(repeated.find(item => item.chapter === 24).choices, repeats[24].root,
    'Each chapter retains its own live choices');

const data = new Map();
const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
const first = context.cachedPositionCatalog(fixtures, 'white', 'original pgn', storage);
played = 0;
const freshTrees = JSON.parse(JSON.stringify(fixtures));
const warm = context.cachedPositionCatalog(freshTrees, 'white', 'original pgn', storage);
assert.equal(JSON.stringify(warm), JSON.stringify(first));
assert.equal(played, 0, 'A warm reopening must not replay any moves');
assert.equal(warm[0].choices, freshTrees[0].root);
const edited = [tree(['d4', 'd5', 'c4'])];
assert.equal(JSON.stringify(context.cachedPositionCatalog(edited, 'white', 'edited pgn', storage)), JSON.stringify(reference(edited, 'white')));
assert.equal(data.size, 1, 'Opening another study replaces the sole cache entry');
assert.equal(JSON.stringify(context.cachedPositionCatalog(edited, 'black', 'edited pgn', storage)), JSON.stringify(reference(edited, 'black')));
const key = [...data.keys()][0];
data.set(key, '{broken');
assert.equal(JSON.stringify(context.cachedPositionCatalog(edited, 'black', 'edited pgn', storage)), JSON.stringify(reference(edited, 'black')));
const corrupt = JSON.parse(data.get(key));
corrupt.positions[0].path = [999];
data.set(key, JSON.stringify(corrupt));
assert.equal(JSON.stringify(context.cachedPositionCatalog(edited, 'black', 'edited pgn', storage)), JSON.stringify(reference(edited, 'black')));
context.cachedPositionCatalog(edited, 'white', 'x'.repeat(600 * 1024), storage);
assert.equal(data.size, 0, 'Oversized input evicts the cache instead of retaining stale data');
context.cachedPositionCatalog(Array.from({ length: 4000 }, () => edited[0]), 'white', 'large catalog', storage);
assert.equal(data.size, 0, 'Oversized derived catalogs must not grow session storage');
const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
assert.equal(JSON.stringify(context.cachedPositionCatalog(edited, 'white', 'edited pgn', blocked)), JSON.stringify(reference(edited, 'white')));
console.log('Catalog equivalence, shared prefixes, bounded caching, edits, colors and unavailable storage passed');
