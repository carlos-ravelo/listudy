export function parseUciMove(uci) {
    if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
    return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

export function moveToUci(move) {
    return move.from + move.to + (move.promotion || '');
}

export function playUciMove(position, uci) {
    const move = parseUciMove(uci);
    return move ? position.move(move) : null;
}

export function inspectMove(position, input) {
    const move = position.move(input);
    if (move) position.undo();
    return move;
}
