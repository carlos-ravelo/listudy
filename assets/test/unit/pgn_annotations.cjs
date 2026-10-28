const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('pgn-parser');
const annotationGlyphs = require('./pgn_annotations_helper.cjs');
const context = vm.createContext({ require, annotationGlyphs });
for (const file of ['pgn/tree.js', 'pgn/tree_from_pgn.js', 'study/chapter_editor.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../../js/modules', file), 'utf8');
    vm.runInContext(source.replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/g, '').replace(/^export /gm, ''), context);
}
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const fen = new Chess().fen();
for (const [symbol, glyph] of [['!', 1], ['?', 2], ['!!', 3], ['??', 4], ['!?', 5], ['?!', 6]]) {
    const pgn = `[Event "Annotations"]\n1. e4${symbol} $${glyph} $14 (1. d4${symbol}) e5 *`;
    const parsed = parser.parse(pgn)[0];
    const editor = context.createChapterEditor({ title: 'Test', fen, comment: '', root: [] });
    editor.loadPgn(pgn);
    assert.deepEqual(Array.from(context.createNode(parsed.moves[0]).nags), [glyph, 14]);
    assert.deepEqual(Array.from(editor.tree.root[0].nags), [glyph, 14]);
    assert.deepEqual(Array.from(editor.tree.root[1].nags), [glyph], 'Variations use the same annotation rules');
    const reimported = context.createChapterEditor({ title: 'Round trip', fen, comment: '', root: [] });
    reimported.loadPgn(editor.pgn());
    assert.deepEqual(Array.from(reimported.tree.root[0].nags), [glyph, 14]);
}
assert.deepEqual(annotationGlyphs({ move: 'e4', nags: ['$1', 1, '$14'] }), [1, 14]);
assert.deepEqual(annotationGlyphs({ move: 'e4' }), []);
console.log('PGN annotations: editor/training agreement, all symbols, deduplication, variations and round trips passed');
