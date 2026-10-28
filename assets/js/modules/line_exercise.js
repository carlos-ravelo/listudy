import { inspectMove, moveToUci, playUciMove, parseUciMove } from './chess_moves.js';
import { enginePosition } from './engine_position.js';
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

export function normalizeExerciseLine(fen, moves, format = 'uci') {
    const position = new Chess(fen);
    return moves.map(input => {
        const move = format === 'san' ? position.move(input) : playUciMove(position, input);
        if (!move) throw new Error('Invalid exercise continuation');
        return moveToUci(move);
    });
}

export function createLineExercise({ getPosition, applyMove, validator = null }) {
    let line = [], initialFen, revision = 0, pending = false, closed = false, complete = true;
    const isCurrent = token => !closed && token === revision;
    return {
        get revision() { return revision; },
        get pending() { return pending; },
        get complete() { return complete; },
        get remaining() { return line.slice(); },
        isCurrent,
        reset({ initialFen: root, moves = [], format = 'uci' } = {}) {
            const tokens = typeof moves === 'string' ? moves.trim().split(/\s+/).filter(Boolean) : moves;
            const next = tokens.length ? normalizeExerciseLine(getPosition().fen(), tokens, format) : [];
            revision++; validator?.reset?.();
            line = next; initialFen = root; pending = false; closed = false; complete = !line.length;
        },
        stop() { revision++; closed = true; pending = false; validator?.reset?.(); },
        async play(input, { onChecking, onPlayerMove, beforeReply } = {}) {
            if (pending || closed || complete) return null;
            const token = revision, position = getPosition(), fen = position.fen();
            const current = () => isCurrent(token) && getPosition() === position;
            pending = true;
            try {
                const candidate = inspectMove(position, typeof input === 'string' ? parseUciMove(input) || input : input);
                if (!candidate) return { status: 'illegal', revision: token };
                const played = moveToUci(candidate);
                let continuation = null;
                if (played !== line[0]) {
                    if (!validator) return { status: 'rejected', revision: token };
                    onChecking?.();
                    let result;
                    try { result = await validator.validate(enginePosition(initialFen, position), line[0], played, line.length); }
                    catch (_) { result = { status: 'unknown' }; }
                    if (!current() || position.fen() !== fen) return null;
                    if (!result) return null;
                    if (result.status !== 'accepted') return { status: result.status, revision: token };
                    let replacement;
                    try { replacement = normalizeExerciseLine(fen, result.line); }
                    catch (_) { return { status: 'unknown', revision: token }; }
                    if (replacement[0] !== played) return { status: 'unknown', revision: token };
                    line = replacement; continuation = replacement.slice();
                }
                const move = applyMove(line[0]);
                if (!move) return { status: 'illegal', revision: token };
                line.shift();
                onPlayerMove?.(move);
                let reply = null;
                // Stored exercises can include a terminal opponent move for reveal.
                // Only play a reply when another player decision follows it.
                if (line.length >= 2) {
                    const afterPlayer = position.fen();
                    if (beforeReply) await beforeReply();
                    if (!current() || position.fen() !== afterPlayer) return null;
                    reply = applyMove(line[0]);
                    if (!reply) throw new Error('Invalid exercise reply');
                    line.shift();
                } else complete = true;
                return { status: 'accepted', move, reply, complete, continuation, revision: token };
            } finally {
                if (token === revision) pending = false;
            }
        }
    };
}
