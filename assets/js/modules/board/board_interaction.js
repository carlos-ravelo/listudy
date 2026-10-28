export function legalDestinations(moves) {
    const destinations = new Map();
    for (const { from, to } of moves) {
        if (!destinations.has(from)) destinations.set(from, []);
        const targets = destinations.get(from);
        if (!targets.includes(to)) targets.push(to);
    }
    return destinations;
}

function interaction(position, { playable = true, color = position.turn() === 'w' ? 'white' : 'black', check = position.in_check() } = {}) {
    return {
        turnColor: position.turn() === 'w' ? 'white' : 'black',
        check,
        movable: { free: false, color: playable ? color : undefined,
            dests: playable ? legalDestinations(position.moves({ verbose: true })) : new Map() }
    };
}

export function setBoardInteraction(board, position, options) {
    board.set(interaction(position, options));
}

export function restoreBoardPosition(board, position, options = {}) {
    const last = position.history({ verbose: true }).slice(-1)[0];
    const { lastMove = last ? [last.from, last.to] : null } = options;
    board.set({ fen: position.fen(), lastMove: lastMove || undefined, ...interaction(position, options) });
}

export function blockBoardMoves(board) {
    board.set({ movable: { free: false, color: undefined, dests: new Map() } });
}
