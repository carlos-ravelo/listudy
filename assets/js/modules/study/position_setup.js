const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

export function setupPositionFen(board, turn) {
    const fen = `${board} ${turn} - - 0 1`;
    if (!new Chess().validate_fen(fen).valid || (board.match(/K/g) || []).length !== 1 || (board.match(/k/g) || []).length !== 1) throw Error('position');
    const position = new Chess(fen);
    const pieces = position.board().flat().filter(Boolean);
    for (const color of ['w', 'b']) {
        if (pieces.filter(piece => piece.color === color && piece.type === 'k').length !== 1) throw Error('position');
        if (pieces.filter(piece => piece.color === color).length > 16 || pieces.filter(piece => piece.color === color && piece.type === 'p').length > 8) throw Error('position');
    }
    if ([position.board()[0], position.board()[7]].flat().some(piece => piece?.type === 'p')) throw Error('position');
    const previous = new Chess(`${board} ${turn === 'w' ? 'b' : 'w'} - - 0 1`);
    if (previous.in_check()) throw Error('position');
    return board === new Chess().fen().split(' ')[0] ? `${board} ${turn} KQkq - 0 1` : fen;
}
