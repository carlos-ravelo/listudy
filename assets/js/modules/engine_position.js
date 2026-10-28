import { moveToUci } from './chess_moves.js';
export function enginePosition(initialFen, chess) {
    return { initialFen, fen: chess.fen(), turn: chess.turn(),
        moves: chess.history({verbose: true}).map(moveToUci) };
}
