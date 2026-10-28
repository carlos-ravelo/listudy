import { inspectMove } from './chess_moves.js';
import { legalDestinations } from './board_interaction.js';
const Chess = require('chess.js')

function setup_chess(fen) {
    const chess = new Chess(fen)
    window.chess = chess;
}

function legal_moves_san(c) {
    return c.moves()
}

// The legal moves in the format that Chessground can use.
function ground_legal_moves(c) {
    return legalDestinations(c.moves({verbose: true}));
}

/*
 * Convert moves in from to notation (b1 c3)
 * to SAN notation (Nc3) 
 * iff the move is legal in the chess position 
 */
function uci_to_san(chess, from, to) {
    return inspectMove(chess, {from, to, promotion: 'q'})?.san || null;
}

/*
 * Reverse of uci_to_san
 */
function san_to_uci(chess, san) {
    let move = inspectMove(chess, san);
    
    if (move === null) {
        console.error("🚨 ERROR: Illegal move or corrupted text detected.");
        console.error("Attempted text (SAN):", "'" + san + "'");
        console.error("Current position (FEN):", chess.fen());
        // Return a false value to prevent crashing and allow the rest to work
        return {from: "a1", to: "a1"}; 
    }
    
    return {from: move.from, to: move.to};
}

function get_color_from_cal(cal) {
    let c = cal[0];
    switch (c) {
        case "G":
            return "green";
        case "R":
            return "red";
        case "Y":
            return "yellow";
        case "B":
        default:
            return "blue";
    }
}

function cal_to_ucistr(cal) {
    return cal.substr(1,4);
}

// cal ex "Ye2e4" to ftc {from, to, color}
function cal_to_ftc(cal) {
    return {
        from: cal.substr(1,2),
        to: cal.substr(3,2),
        color: get_color_from_cal(cal)
    }
}

function move_to_ucistr(m) {
    let uci = san_to_uci(chess, m.move);
    return "" + uci.from + uci.to;
}

/*
 * Convert the color string to the one used in the db
 */
function turn_color(chess) {
    let color = chess.turn();
    if (color == "b") {
        return "black";
    } else if (color == "w") {
        return "white"
    }
    // This should not happen!
    console.log("Chess.js;turn_color; Color is neither b nor w.")
    return "white";
}

function non_turn_color(chess) {
    return turn_color(chess) == "white" ? "black" : "white";
}

function initial_fen(chess) {
    let pgn = chess.pgn();
    let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    try {
        fen = pgn.split("FEN")[1].split("\"")[1];
    } catch (error) {}
    return fen;
}
 
export { turn_color, san_to_uci, uci_to_san, setup_chess, ground_legal_moves, initial_fen, non_turn_color, get_color_from_cal, cal_to_ucistr, cal_to_ftc, move_to_ucistr };
