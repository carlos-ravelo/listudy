const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

export function createChapterEditor(chapter) {
    const tree = JSON.parse(JSON.stringify({ root: chapter.root, comment: chapter.comment }));
    const original = JSON.stringify(tree);
    let path = [];

    function node(at = path) {
        let current = tree;
        let children = tree.root;
        for (const index of at) {
            if (!Number.isInteger(index) || !children[index]) throw new Error('Invalid move path');
            current = children[index];
            children = current.children;
        }
        return current;
    }

    function position(at = path) {
        const board = new Chess(chapter.fen);
        let children = tree.root;
        for (const index of at) {
            if (!Number.isInteger(index) || !children[index] || !board.move(children[index].move)) {
                throw new Error('Invalid move path');
            }
            children = children[index].children;
        }
        return board;
    }

    return {
        tree,
        get path() { return [...path]; },
        get dirty() { return JSON.stringify(tree) !== original; },
        node,
        position,
        select(at) {
            position(at);
            path = [...at];
        },
        setComment(comment) { node().comment = comment; },
        play(from, to, promotion = 'q') {
            const board = position();
            const move = board.move({ from, to, promotion });
            if (!move) return false;
            const parent = node();
            const children = path.length ? parent.children : tree.root;
            let index = children.findIndex(child => child.move === move.san);
            if (index < 0) {
                index = children.length;
                children.push({ move: move.san, comment: '', starting_comment: '', nags: [], children: [] });
                tree.root = [...tree.root];
            }
            path = [...path, index];
            return true;
        }
    };
}
