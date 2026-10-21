const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({require});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/chapter_editor.js'), 'utf8')
    .replace('export function', 'function'), context);
const initial = {
    title: 'Study', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    comment: 'Introduction', root: [{move: 'e4', comment: 'First', nags: [1, 14], children: [
        {move: 'e5', comment: 'Main', children: [{move: 'Nf3', comment: '', children: []}]},
        {move: 'c5', comment: 'Sicilian', nags: [5], children: [
            {move: 'Nf3', comment: '', children: []},
            {move: 'Nc3', comment: 'Closed', children: []}
        ]}
    ]}, {move: 'd4', comment: 'Queen pawn', children: []}]
};
const make = () => context.createChapterEditor(initial);
const snapshot = editor => JSON.stringify(editor.tree);
const source = JSON.stringify(initial);

const text = make();
text.select([0]);
assert.equal(text.canUndo, false);
text.setComment('One'); text.setComment('Two'); text.setComment('Final');
assert.equal(text.undo(), true);
assert.equal(text.node().comment, 'First');
assert.equal(text.canUndo, false, 'Typing one comment is a single undo step');
assert.equal(text.dirty, false);
text.redo();
assert.equal(text.node().comment, 'Final');
text.setTitle('Renamed');
text.undo();
assert.equal(text.tree.title, 'Study');
assert.equal(text.node().comment, 'Final');
text.select([0, 0]);
text.setComment('Different position');
assert.equal(text.canRedo, false, 'A new edit replaces the redo branch');
text.undo();
assert.equal(text.node().comment, 'Main');

const promote = make();
const original = snapshot(promote);
promote.select([0, 1, 1]);
const selectedFen = promote.position().fen();
assert.equal(promote.canPromote, true);
assert.equal(promote.promoteVariation(), true);
assert.equal(promote.path.join(','), '0,0,0');
assert.equal(promote.position().fen(), selectedFen);
assert.equal(promote.tree.root[0].children[0].move, 'c5');
assert.equal(promote.tree.root[0].children[0].children[0].move, 'Nc3');
assert.equal(promote.tree.root[0].children[0].comment, 'Sicilian');
assert.equal(promote.tree.root[0].children[0].nags[0], 5);
assert.equal(promote.tree.root[0].children[1].comment, 'Main');
assert.equal(promote.canPromote, false);
assert.equal(promote.promoteVariation(), false);
promote.undo();
assert.equal(snapshot(promote), original);
assert.equal(promote.path.join(','), '0,1,1');
promote.redo();
assert.equal(promote.position().fen(), selectedFen);
promote.select([1]);
promote.promoteVariation();
assert.equal(promote.tree.root[0].move, 'd4');
promote.undo();
assert.equal(promote.tree.root[0].move, 'e4');

const direct = make();
direct.select([0, 0]);
assert.equal(direct.promoteVariation([0, 1, 1]), true);
assert.equal(direct.path.join(','), '0,0,0');
assert.equal(direct.tree.root[0].children[0].children[0].move, 'Nc3');
assert.ok(direct.pgn().indexOf('c5') < direct.pgn().indexOf('e5'));
direct.undo();
assert.equal(snapshot(direct), original);
assert.equal(direct.path.join(','), '0,0');
direct.redo();
assert.equal(direct.path.join(','), '0,0,0');

const marks = make();
assert.equal(marks.setAnnotation(4), false);
assert.equal(marks.canUndo, false);
marks.select([0]);
assert.equal(marks.setAnnotation(4), true);
assert.equal(marks.node().nags.join(','), '4,14', 'Preserve position evaluations and other annotations');
assert.ok(marks.pgn().includes('$4 $14'));
assert.equal(marks.setAnnotation(4), false);
marks.undo();
assert.equal(marks.node().nags.join(','), '1,14');
assert.equal(marks.dirty, false);
marks.redo();
marks.setAnnotation(0);
assert.equal(marks.node().nags.join(','), '14');
marks.undo();
assert.equal(marks.node().nags.join(','), '4,14');
marks.select([1]);
marks.setAnnotation(6);
marks.undo();
assert.equal(Object.hasOwn(marks.node(), 'nags'), false);
assert.equal(marks.setAnnotation(99), false);

const saved = make();
saved.select([0, 1]);
saved.deleteFromHere();
const afterDelete = snapshot(saved);
saved.markSaved();
assert.equal(saved.dirty, false);
saved.undo();
assert.equal(saved.tree.root[0].children[1].move, 'c5');
assert.equal(saved.dirty, true, 'Saving must retain undo while moving the clean baseline');
saved.redo();
assert.equal(snapshot(saved), afterDelete);
assert.equal(saved.dirty, false);
saved.play('c7', 'c6');
assert.equal(saved.tree.root[0].children[1].move, 'c6');
saved.undo();
assert.equal(saved.dirty, false);
saved.undo();
assert.equal(saved.tree.root[0].children[1].move, 'c5');
saved.redo(); saved.redo();
assert.equal(saved.tree.root[0].children[1].move, 'c6');

const imported = make();
imported.select([0, 1]);
imported.setComment('Before import');
const beforeImport = snapshot(imported);
imported.loadPgn('[Event "Imported"]\n\n1. d4? d5 $1 *');
assert.equal(imported.tree.root[0].nags[0], 2);
assert.equal(imported.tree.root[0].children[0].nags[0], 1);
imported.undo();
assert.equal(snapshot(imported), beforeImport);
assert.equal(imported.path.join(','), '0,1');
imported.undo();
assert.equal(imported.node().comment, 'Sicilian');
imported.redo(); imported.redo();
assert.equal(imported.tree.title, 'Imported');
const beforeInvalid = snapshot(imported);
assert.throws(() => imported.loadPgn('1. e4 e4 *'));
assert.equal(snapshot(imported), beforeInvalid);
imported.undo();
assert.equal(snapshot(imported), beforeImport);

const empty = make();
empty.select([0]); empty.deleteFromHere();
empty.select([0]); empty.deleteFromHere();
assert.equal(empty.tree.root.length, 0);
empty.undo(); empty.undo();
assert.equal(snapshot(empty), original);
assert.equal(JSON.stringify(initial), source, 'History must never mutate the saved chapter');
console.log('Undo/redo, coalesced text edits, saved baselines, nested promotion, annotations and imports passed');
