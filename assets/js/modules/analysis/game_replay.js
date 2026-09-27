const Chess = require('chess.js');
const Chessground = require('chessground').Chessground;

function movePrefix(fen) {
    const fields = fen.split(' ');
    return fields[5] + (fields[1] === 'w' ? '.' : '...');
}

// Parse once and keep each occurrence of a position, including repetitions and
// games starting from FEN. Switching comparisons never replays the whole PGN.
export function createGameReplay(element, pgn) {
    const game = new Chess();
    if (!game.load_pgn(pgn, { sloppy: true })) {
        throw new Error('The browser could not replay this PGN. You can still open the matching study chapters.');
    }
    const history = game.history();
    const replay = new Chess(game.header().FEN);
    const positions = [replay.fen()];
    const moves = [];
    history.forEach(san => {
        const label = `${movePrefix(replay.fen())} ${san}`;
        const move = replay.move(san);
        if (!move) throw new Error('The browser could not replay every move in this PGN.');
        moves.push({ label, from: move.from, to: move.to });
        positions.push(replay.fen());
    });

    const ground = Chessground(element, {
        fen: positions[0],
        viewOnly: true,
        drawable: { enabled: false },
        animation: { enabled: true, duration: 200 }
    });
    let currentPly = 0;
    let comparison = null;

    function arrow(fen, san, brush) {
        if (!san) return null;
        const move = new Chess(fen).move(san, { sloppy: true });
        return move ? { orig: move.from, dest: move.to, brush } : null;
    }

    function seek(ply) {
        if (!Number.isInteger(ply)) return;
        currentPly = Math.max(0, Math.min(moves.length, ply));
        const event = comparison && (currentPly === comparison.ply
            ? comparison
            : (comparison.earlier_departures || []).find(item => item.ply === currentPly));
        const shapes = event ? [
            ...(event.expected || []).map(san => arrow(event.fen, san, 'green')),
            arrow(event.fen, event.played, 'red')
        ].filter(Boolean) : [];
        const previous = moves[currentPly - 1];
        ground.set({
            fen: positions[currentPly],
            turnColor: positions[currentPly].split(' ')[1] === 'w' ? 'white' : 'black',
            lastMove: previous ? [previous.from, previous.to] : undefined,
            drawable: { shapes }
        });
        element.dataset.ply = currentPly;
    }

    return {
        moves,
        get ply() { return currentPly; },
        get targetPly() { return comparison ? comparison.ply : 0; },
        get status() {
            const position = currentPly === 0 ? 'Starting position' : `After ${moves[currentPly - 1].label}`;
            return position + (comparison && currentPly === comparison.ply ? ' · Comparison position' : '');
        },
        seek,
        select(result, color) {
            comparison = result;
            ground.set({ orientation: color === 'black' ? 'black' : 'white' });
            seek(result.ply);
        }
    };
}
