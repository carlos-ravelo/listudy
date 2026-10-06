const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.attributes = new Map();
        this.scrollTop = 0;
    }
    appendChild(child) { child.parentElement = this; this.children.push(child); }
    replaceChildren(...children) { this.children = []; children.forEach(child => this.appendChild(child)); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    getBoundingClientRect() { return { top: 0, bottom: 100 }; }
}
const context = vm.createContext({ require, document: { createElement: tag => new Element(tag) } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/study_move_tree.js'), 'utf8')
    .replace(/^export /gm, ''), context);

const root = [
    { move: 'e4', children: [
        { move: 'e5', children: [{ move: 'Nf3', children: [] }] },
        { move: 'c5', children: [
            { move: 'Nf3', children: [] },
            { move: 'Nc3', children: [] }
        ] }
    ] },
    { move: 'd4', children: [{ move: 'd5', children: [] }] }
];
const lines = context.chapterMoveLines(root);
assert.equal(JSON.stringify(lines.moves.map(move => move.label)), JSON.stringify(['1. e4', '1... e5', '2. Nf3']));
assert.equal(lines.variations[0].moves[0].label, '1. d4');
assert.equal(lines.variations[1].moves[0].label, '1... c5');
assert.equal(lines.variations[1].variations[0].moves[0].label, '2. Nc3');
assert.equal(JSON.stringify(lines.variations[1].variations[0].moves[0].path), JSON.stringify([0, 1, 1]));
assert.equal(JSON.stringify(context.readChapterPosition(root, undefined, [0, 1, 1]).history()), JSON.stringify(['e4', 'c5', 'Nc3']));
assert.equal(context.readChapterPosition(root, undefined, [-1]), null);
assert.equal(context.readChapterPosition(root, undefined, [0, 3]), null);
assert.equal(context.readChapterPosition(root, undefined, '0'), null);
assert.equal(context.readChapterPosition([{ move: 'illegal', children: [] }], undefined, [0]), null);
const fen = '4k3/8/8/8/8/8/8/4K3 b - - 0 17';
const custom = [{ move: 'Kd7', children: [{ move: 'Kd2', children: [] }] }];
const labels = context.chapterMoveLines(custom, fen).moves.map(move => move.label);
assert.equal(JSON.stringify(labels), JSON.stringify(['17... Kd7', '18. Kd2']));
assert.equal(JSON.stringify(context.readChapterPosition(custom, fen, [0, 0]).history()), JSON.stringify(['Kd7', 'Kd2']));

const element = new Element('div');
let selected;
const view = context.setupStudyMoveTree({ element, onSelect: value => { selected = value; }, startLabel: 'Start', variationLabel: 'Variation' });
const update = (path, chapter = 0, tree = root) => view.update({ reading: true, chapter, root: tree, path });
const all = node => [node, ...node.children.flatMap(all)];
update([0]);
let active = all(element).filter(node => node.attributes.get('aria-current') === 'step');
assert.equal(active.length, 1);
assert.equal(active[0].textContent, 'e4');
assert.equal(active[0].attributes.get('aria-label'), '1. e4');
assert.equal(active[0].attributes.get('data-move-prefix'), '1.');
const firstRow = active[0].parentElement;
assert.equal(firstRow.children[0].textContent, '1.');
assert.equal(firstRow.children[1].textContent, 'e4');
assert.equal(firstRow.children[2].textContent, 'e5');
update([0, 1, 1]);
active = all(element).filter(node => node.attributes.get('aria-current') === 'step');
assert.equal(active.length, 1);
assert.equal(active[0].textContent, 'Nc3');
const ancestors = [];
for (let parent = active[0].parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') ancestors.push(parent);
}
assert.equal(ancestors.length, 2);
assert(ancestors.every(parent => parent.open));
active[0].onclick();
assert.equal(JSON.stringify(selected), JSON.stringify([0, 1, 1]));
const start = element.children[0];
start.onclick();
assert.equal(JSON.stringify(selected), '[]');
view.update({ reading: false });
assert.equal(element.hidden, true);
update([], 1, custom);
assert.equal(element.hidden, false);
assert.equal(all(element).filter(node => node.attributes.get('aria-current') === 'step')[0].textContent, 'Start');
assert.equal(all(element).filter(node => node.tagName === 'BUTTON').length, 3);
view.update({ reading: true, chapter: 2, root: custom, fen, path: [0] });
const blackMove = all(element).find(node => node.attributes.get('aria-current') === 'step');
assert.equal(blackMove.textContent, 'Kd7');
assert.equal(blackMove.attributes.get('aria-label'), '17... Kd7');
assert.equal(blackMove.attributes.get('data-move-prefix'), '17...');
assert.equal(blackMove.parentElement.children[0].textContent, '17.');
assert.equal(blackMove.parentElement.children[1].textContent, '—');
assert.equal(blackMove.parentElement.children[2], blackMove);
console.log('Study move tree regression checks passed.');
