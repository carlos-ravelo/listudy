import { parseUciMove } from './chess_moves.js';
import { restoreBoardPosition } from './board_interaction.js';

export function createBoardGame({ getPosition, getBoard, getOptions = () => ({}), onMove = () => {} }) {
    function restore(options = {}) {
        restoreBoardPosition(getBoard(), getPosition(), { ...getOptions(), ...options });
    }

    return {
        restore,
        play(input, options) {
            const position = getPosition();
            const move = position.move(typeof input === 'string' ? parseUciMove(input) || input : input);
            if (move) onMove(move, position);
            restore(options);
            return move;
        },
        undo(count = 1, options) {
            const position = getPosition();
            if (!Number.isInteger(count) || count < 1 || position.history().length < count) return [];
            const moves = [];
            for (let index = 0; index < count; index++) moves.push(position.undo());
            restore(options);
            return moves;
        }
    };
}
