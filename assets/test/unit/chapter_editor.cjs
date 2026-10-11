const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../js/modules/study/chapter_editor.js'), 'utf8');
const context = vm.createContext({ require });
vm.runInContext(source.replace('export function', 'function'), context);

const chapter = {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    comment: 'Introduction',
    root: [{ move: 'e4', comment: 'Original', nags: [1], children: [
        { move: 'e5', comment: '', children: [] }
    ] }]
};
const before = JSON.stringify(chapter);
const editor = context.createChapterEditor(chapter);
assert.equal(editor.dirty, false);
assert.equal(editor.play('e2', 'e4'), true);
assert.equal(editor.dirty, false, 'navigating an existing continuation does not edit it');
assert.equal(editor.play('c7', 'c5'), true);
assert.equal(editor.dirty, true);
assert.equal(editor.tree.root[0].children[0].move, 'e5');
assert.equal(editor.tree.root[0].children[1].move, 'c5');
assert.equal(editor.tree.root[0].nags[0], 1);
editor.setComment('Sicilian');
assert.equal(editor.node().comment, 'Sicilian');
assert.equal(JSON.stringify(chapter), before, 'draft changes never mutate the source snapshot');
editor.select([]);
editor.setComment('New introduction');
assert.equal(editor.tree.comment, 'New introduction');
assert.equal(editor.play('e2', 'e5'), false);
assert.throws(() => editor.select([99]));
const black = context.createChapterEditor({
    fen: '4k3/8/8/8/8/8/p7/4K3 b - - 0 1', comment: '', root: []
});
assert.equal(black.play('a2', 'a1', 'n'), true);
assert.equal(black.node().move, 'a1=N');
const draftPgn = editor.pgn();
assert.ok(draftPgn.includes('{ New introduction }'));
assert.ok(draftPgn.includes('1. e4 $1 { Original } 1... e5 (1... c5 { Sicilian })'));
assert.equal(require('pgn-parser').parse(draftPgn)[0].moves[1].ravs[0].moves[0].move, 'c5');
assert.equal(editor.dirty, true, 'exporting does not mark the draft as saved');
assert.ok(black.pgn().includes('[SetUp "1"]'));
assert.ok(black.pgn().includes('1... a1=N'));
editor.loadPgn(draftPgn);
assert.equal(editor.tree.root[0].children[1].move, 'c5');
assert.equal(editor.tree.root[0].children[1].comment, 'Sicilian');
assert.equal(editor.tree.comment, 'New introduction');
const imported = JSON.stringify(editor.tree);
assert.throws(() => editor.loadPgn('1. e4 e5 2. Ke8 *'));
assert.equal(JSON.stringify(editor.tree), imported, 'invalid PGN preserves the draft');
assert.throws(() => editor.loadPgn(draftPgn + '\n\n' + draftPgn));
assert.throws(() => editor.loadPgn(black.pgn()));
editor.loadPgn('[Event "Pasted"]\n\n1. d4 {New} ( {Alternative} 1. e4 e5) d5 *');
assert.equal(editor.tree.title, 'Pasted');
assert.equal(editor.tree.root[0].move, 'd4');
assert.equal(editor.tree.root[1].starting_comment, 'Alternative');
assert.equal(editor.tree.root[1].children[0].move, 'e5');
assert.equal(editor.dirty, true);
black.loadPgn(black.pgn());
assert.equal(black.tree.root[0].move, 'a1=N');
console.log('Chapter editor model checks passed.');
