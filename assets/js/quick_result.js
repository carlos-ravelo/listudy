const Chessground = require('chessground').Chessground;
const Chess = require('chess.js');
document.addEventListener("DOMContentLoaded", () => {
    const boardElement = document.getElementById("quick-analysis-board");
    if (!boardElement) return;

    const pgnText = boardElement.dataset.pgn;
    const errorFen = boardElement.dataset.errorFen;
    const expectedSanList = boardElement.dataset.expected.split(",");
    const playedSan = boardElement.dataset.played;

    const game = new Chess();
    game.load_pgn(pgnText);
    const history = game.history();
    
    // We recreate the game state step by step for navigation
    const replayGame = new Chess();
    let currentMoveIndex = 0;
    let targetIndex = 0;

    // Find the move index where the error occurred
    const tempGame = new Chess();
    for (let i = 0; i < history.length; i++) {
        if (tempGame.fen().split(" ")[0] === errorFen.split(" ")[0]) {
            targetIndex = i;
            break;
        }
        tempGame.move(history[i]);
    }

    // Initialize Chessground
    const cg = Chessground(boardElement, {
        fen: replayGame.fen(),
        viewOnly: true,
        animation: { enabled: true, duration: 200 }
    });

    // Helper: Convert SAN to squares for drawing arrows
    function getMoveSquares(fen, san) {
        const aux = new Chess(fen);
        const moveObj = aux.move(san);
        if (!moveObj) return null;
        return { orig: moveObj.from, dest: moveObj.to };
    }

    function updateBoard() {
        cg.set({ fen: replayGame.fen() });
        
        let shapes = [];
        
        // If we are exactly at the error FEN, draw the arrows
        if (replayGame.fen().split(" ")[0] === errorFen.split(" ")[0]) {
            // Draw expected moves in green
            expectedSanList.forEach(san => {
                const sq = getMoveSquares(errorFen, san);
                if (sq) shapes.push({ orig: sq.orig, dest: sq.dest, brush: 'green' });
            });
            
            // Draw played move in red
            const playedSq = getMoveSquares(errorFen, playedSan);
            if (playedSq) shapes.push({ orig: playedSq.orig, dest: playedSq.dest, brush: 'red' });
        }
        
        cg.set({ drawable: { shapes: shapes } });
    }

    function nextMove() {
        if (currentMoveIndex < history.length) {
            replayGame.move(history[currentMoveIndex]);
            currentMoveIndex++;
            updateBoard();
        }
    }

    function prevMove() {
        if (currentMoveIndex > 0) {
            replayGame.undo();
            currentMoveIndex--;
            updateBoard();
        }
    }

    // Event Listeners
    document.getElementById("btn-next").addEventListener("click", nextMove);
    document.getElementById("btn-prev").addEventListener("click", prevMove);
    document.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") nextMove();
        if (e.key === "ArrowLeft") prevMove();
    });

    // Jump directly to the error position on load
    while (currentMoveIndex < targetIndex) {
        nextMove();
    }
});