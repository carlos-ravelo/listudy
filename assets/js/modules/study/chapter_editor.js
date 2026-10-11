const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

export function createChapterEditor(chapter) {
    const tree = JSON.parse(JSON.stringify({ title: chapter.title, root: chapter.root, comment: chapter.comment }));
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
                    nags: (first.nags || []).map(nag => Number(nag.replace('$', ''))),
                    children: line(rest, board.fen()) };
                return [main, ...(first.ravs || []).flatMap(variation =>
                    line(variation.moves, fen, comments(variation.comments)))];
            }
            const root = line(game.moves, initial.fen());
            tree.title = headers.Event || tree.title;
            tree.comment = comments(game.comments);
            tree.root = root;
            path = [];
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
        node,
        position,
        select(at) {
            position(at);
            path = [...at];
        },
        setComment(comment) { node().comment = comment; },
        setTitle(title) { tree.title = title; },
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
