import { playUciMove } from './chess_moves.js';
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

export function engineLine(fen, pv = [], limit = 6) {
    if (!Array.isArray(pv) || !pv.length) return '';
    const position = new Chess(fen);
    const line = [];
    for (const uci of pv.slice(0, limit)) {
        const move = playUciMove(position, uci);
        if (!move) break;
        line.push(move.san);
    }
    return line.join(' ');
}
