import { annotationGlyphs } from '../pgn/annotations.js';

const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

export function createChapterEditor(chapter) {
    const tree = JSON.parse(JSON.stringify({ title: chapter.title, root: chapter.root, comment: chapter.comment }));
    let original = JSON.stringify(tree);
    let path = [];
    const undoStack = [], redoStack = [];
    let typing;

    function restore(change, direction) {
        for (const field of change.fields) {
            const value = field[direction];
            if (value === undefined) delete field.target[field.key];
            else field.target[field.key] = value;
        }
        path = [...(direction === 'before' ? change.beforePath : change.afterPath)];
        if (change.structural) tree.root = [...tree.root];
    }

    function edit(fields, nextPath = path, structural = false, coalesce = false) {
        fields = fields.filter(field => field.target[field.key] !== field.after);
        if (!fields.length) return false;
        const previous = undoStack[undoStack.length - 1];
        if (coalesce && previous && typing === previous && fields.length === 1 &&
            previous.fields[0].target === fields[0].target && previous.fields[0].key === fields[0].key) {
            previous.fields[0].after = fields[0].after;
            restore(previous, 'after');
        } else {
            const change = {fields: fields.map(field => ({...field, before: field.target[field.key]})),
                beforePath: [...path], afterPath: [...nextPath], structural};
            restore(change, 'after');
            undoStack.push(change);
        }
        redoStack.length = 0;
        typing = coalesce ? undoStack[undoStack.length - 1] : null;
        return true;
    }

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
        loadPgn(text) {
            const games = require('pgn-parser').parse(text);
            if (games.length !== 1) throw new Error('singleChapter');
            const game = games[0];
            const headers = Object.fromEntries((game.headers || []).map(header => [header.name, header.value]));
            const initial = new Chess(headers.FEN);
            if (initial.fen() !== new Chess(chapter.fen).fen()) throw new Error('samePosition');
            const comments = values => (values || []).map(value => (value.text || '').trim()).join('\n');
            function line(moves, fen, startingComment = '') {
                if (!moves.length) return [];
                const board = new Chess(fen);
                const [first, ...rest] = moves;
                const move = board.move(first.move);
                if (!move) throw new Error('invalidPgn');
                const main = { move: move.san, comment: comments(first.comments),
                    starting_comment: startingComment,
                    nags: annotationGlyphs(first),
                    children: line(rest, board.fen()) };
                return [main, ...(first.ravs || []).flatMap(variation =>
                    line(variation.moves, fen, comments(variation.comments)))];
            }
            const root = line(game.moves, initial.fen());
            edit([{target: tree, key: 'title', after: headers.Event || tree.title},
                {target: tree, key: 'comment', after: comments(game.comments)},
                {target: tree, key: 'root', after: root}], [], true);
        },
        pgn() {
            const headers = { ...(chapter.headers || {}), Event: tree.title || '', Result: chapter.headers?.Result || '*' };
            const initial = new Chess(chapter.fen);
            if (initial.fen() !== new Chess().fen()) {
                headers.SetUp = '1';
                headers.FEN = initial.fen();
            }
            const escape = value => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
            const comment = value => value ? `{ ${value.replace(/[{}]/g, '')} }` : '';
            function line(children, fen) {
                if (!children.length) return '';
                const board = new Chess(fen);
                const main = children[0];
                const fields = fen.split(' ');
                const number = `${fields[5]}${fields[1] === 'w' ? '.' : '...'}`;
                const move = board.move(main.move);
                if (!move) throw new Error('Invalid move in chapter');
                return [comment(main.starting_comment), number, move.san,
                    ...(main.nags || []).map(nag => `$${nag}`), comment(main.comment),
                    ...children.slice(1).map(variation => `(${line([variation], fen)})`),
                    line(main.children, board.fen())].filter(Boolean).join(' ');
            }
            return Object.entries(headers).map(([key, value]) => `[${key} "${escape(value)}"]`).join('\n') +
                '\n\n' + [comment(tree.comment), line(tree.root, initial.fen()), headers.Result].filter(Boolean).join(' ');
        },
        get path() { return [...path]; },
        get dirty() { return JSON.stringify(tree) !== original; },
        get canUndo() { return undoStack.length > 0; },
        get canRedo() { return redoStack.length > 0; },
        get canPromote() { return path.some(index => index > 0); },
        markSaved() { original = JSON.stringify(tree); typing = null; },
        undo() {
            const change = undoStack.pop();
            if (!change) return false;
            restore(change, 'before');
            redoStack.push(change);
            typing = null;
            return true;
        },
        redo() {
            const change = redoStack.pop();
            if (!change) return false;
            restore(change, 'after');
            undoStack.push(change);
            typing = null;
            return true;
        },
        node,
        position,
        select(at) {
            position(at);
            path = [...at];
            typing = null;
        },
        setComment(comment) { edit([{target: node(), key: 'comment', after: comment}], path, false, true); },
        setTitle(title) { edit([{target: tree, key: 'title', after: title}], path, false, true); },
        setAnnotation(value) {
            if (!path.length || !Number.isInteger(value) || value < 0 || value > 6) return false;
            const current = node();
            const nags = (current.nags || []).filter(nag => nag < 1 || nag > 6);
            if (value) nags.unshift(value);
            if (JSON.stringify(nags) === JSON.stringify(current.nags || [])) return false;
            return edit([{target: current, key: 'nags', after: nags}], path, true);
        },
        promoteVariation(at = path) {
            if (!at.some(index => index > 0)) return false;
            position(at);
            const fields = [];
            let parent = tree;
            for (let depth = 0; depth < at.length; depth++) {
                const key = depth ? 'children' : 'root';
                const siblings = parent[key];
                const selected = siblings[at[depth]];
                if (at[depth]) fields.push({target: parent, key,
                    after: [selected, ...siblings.filter((_, index) => index !== at[depth])]});
                parent = selected;
            }
            return edit(fields, at.map(() => 0), true);
        },
        deleteFromHere() {
            if (!path.length) return false;
            const parentPath = path.slice(0, -1);
            const parent = node(parentPath);
            const key = parentPath.length ? 'children' : 'root';
            return edit([{target: parent, key,
                after: parent[key].filter((_, index) => index !== path[path.length - 1])}], parentPath, true);
        },
        play(from, to, promotion = 'q') {
            const board = position();
            const move = board.move({ from, to, promotion });
            if (!move) return false;
            const parent = node();
            const children = path.length ? parent.children : tree.root;
            let index = children.findIndex(child => child.move === move.san);
            if (index < 0) {
                index = children.length;
                edit([{target: parent, key: path.length ? 'children' : 'root',
                    after: [...children, { move: move.san, comment: '', starting_comment: '', nags: [], children: [] }]}],
                [...path, index], true);
            } else {
                path = [...path, index];
                typing = null;
            }
            return true;
        }
    };
}
