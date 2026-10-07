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
console.log('Chapter editor model checks passed.');
