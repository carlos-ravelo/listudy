const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

const uci = move => move.from + move.to + (move.promotion || '');

// Listudy's chapter tree is translated lazily; source nodes are never mutated.
export function createChapterSparring(chapter) {
    let chess = new Chess();
    if (chapter.headers.FEN && !chess.load(chapter.headers.FEN)) throw new Error('Invalid chapter FEN');
    const initialFen = chess.fen();
    let children = chapter.root;
    const path = [];
    const position = {
        game: () => chess,
        at(ply) {
            const replay = new Chess(initialFen);
            for (const move of chess.history({ verbose: true }).slice(0, ply)) replay.move({ from: move.from, to: move.to, promotion: move.promotion });
            return replay;
        },
        restore(ply) { chess = position.at(ply); },
        snapshot() {
            return { initialFen, fen: chess.fen(), turn: chess.turn(), over: chess.game_over(),
                result: chess.in_checkmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') : chess.in_draw() ? '1/2-1/2' : '*',
                lastMove: chess.history({ verbose: true }).slice(-1)[0],
                check: chess.in_check(), legal: chess.moves({ verbose: true }).map(uci) };
        },
        play(move) {
            if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move || '')) return false;
            return !!chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
        }
    };
    function choices() {
        const legal = chess.moves({ verbose: true });
        return children.map(node => {
            const move = legal.find(move => move.san === node.move);
            if (!move) throw new Error('Illegal repertoire continuation');
            return { uci: uci(move), san: move.san };
        });
    }
    return { position, repertoire: {
        path: () => [...path],
        choices,
        advance(move) {
            const index = choices().findIndex(choice => choice.uci === move);
            if (index < 0) throw new Error('Unknown repertoire continuation');
            path.push(index);
            children = children[index].children || [];
        }
    } };
}
