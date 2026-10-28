import { playUciMove } from '../board/chess_moves.js';
import { createEndgameEngine } from '../engine/endgame_engine.js';
import { enginePosition } from '../engine/engine_position.js';
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

// Only departures from the authored line load an engine. Keep the complete history.
export function createTacticAlternatives({ createEngine = createEndgameEngine } = {}) {
    let engine, version = 0;
    function reset() { version++; engine?.dispose(); engine = null; }
    async function validate(state, expected, played, remaining) {
        const ticket = version;
        if (!Number.isInteger(remaining) || remaining < 1 || remaining > 64) return {status: 'unknown'};
        engine ||= createEngine();
        const current = engine;
        const board = new Chess(state.initialFen);
        for (const uci of state.moves) if (!playUciMove(board, uci)) return {status: 'unknown'};
        if (board.fen() !== state.fen || board.game_over()) return {status: 'unknown'};
        const reference = playUciMove(board, expected);
        if (!reference) return {status: 'unknown'};
        board.undo();
        if (!playUciMove(board, played)) return {status: 'rejected'};
        if (board.in_checkmate()) return {status: 'accepted', line: [played]};
        if (board.in_draw()) return {status: 'rejected'};
        const candidateState = enginePosition(state.initialFen, board);
        try {
            const exact = await current.assess(state, played);
            if (ticket !== version) return {status: 'unknown'};
            const authored = await current.assess(state, expected);
            if (ticket !== version) return {status: 'unknown'};
            let analysis;
            if (exact && authored) {
                if (exact.after < authored.after) return {status: 'rejected'};
                // An authored loss/draw is not evidence of a winning tactical objective.
                if (exact.after !== 100 || authored.after !== 100) return {status: 'unknown'};
            } else {
                const options = {movetime: 1200, depth: 20};
                const expectedBoard = new Chess(state.initialFen);
                for (const uci of state.moves) playUciMove(expectedBoard, uci);
                playUciMove(expectedBoard, expected);
                const baseline = expectedBoard.in_checkmate() ? {score: {type: 'mate', value: 0}, depth: 99} : await current.analyze(enginePosition(state.initialFen, expectedBoard), options);
                analysis = await current.analyze(candidateState, options);
                if (ticket !== version) return {status: 'unknown'};
                if (!baseline.score || !analysis.score || baseline.depth < 18 || analysis.depth < 18) return {status: 'unknown'};
                const wins = result => result.score.type === 'mate' && result.score.value <= 0;
                if (wins(baseline)) {
                    if (!wins(analysis)) return {status: 'unknown'};
                    if (Math.abs(analysis.score.value) > Math.abs(baseline.score.value)) return {status: 'rejected'};
                } else {
                    if (baseline.score.type !== 'cp' || baseline.score.value > -300) return {status: 'unknown'};
                    if (!wins(analysis) && (analysis.score.type !== 'cp' || analysis.score.value > baseline.score.value + 20)) return {status: 'rejected'};
                }
            }
            // Replace the rest of the solution with a legal engine continuation;
            // never replay the stored opponent response in a different position.
            const line = [played];
            const limit = Math.max(1, Math.min(64, remaining));
            while (line.length < limit && !board.game_over()) {
                const pv = analysis?.pv?.length ? analysis.pv : [await current.bestMove(enginePosition(state.initialFen, board))];
                if (ticket !== version) return {status: 'unknown'};
                for (const uci of pv) {
                    if (line.length >= limit || board.game_over()) break;
                    if (!playUciMove(board, uci)) return {status: 'unknown'};
                    line.push(uci);
                }
                analysis = null;
            }
            if (board.in_draw() || board.in_checkmate() && board.turn() === state.turn) return {status: 'unknown'};
            return ticket === version ? {status: 'accepted', line} : {status: 'unknown'};
        } catch (_) { return {status: 'unknown'}; }
    }
    return {validate, reset};
}
