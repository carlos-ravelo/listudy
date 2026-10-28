import { parseUciMove, moveToUci } from './chess_moves.js';

export function moveArrow(move, brush = 'normal') {
    const candidate = parseUciMove(typeof move === 'string' ? move : move ? moveToUci(move) : null);
    if (!candidate || candidate.from === candidate.to) return null;
    return { orig: candidate.from, dest: candidate.to, brush };
}

export function moveArrows(moves, brush = 'normal') {
    return moves.map(move => moveArrow(move, brush)).filter(Boolean);
}
