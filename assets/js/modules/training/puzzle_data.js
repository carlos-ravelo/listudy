import { parseUciMove } from '../board/chess_moves.js';

export function readPuzzleData(root = document) {
    return Object.fromEntries(['fen', 'color', 'moves', 'last_move'].map(key => [key, root.getElementById(key).value]));
}

export function puzzleLastMove(value) {
    const move = parseUciMove(value);
    return move ? [move.from, move.to] : undefined;
}
