const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const source = fs.readFileSync(path.join(__dirname, '../../js/play_stockfish.js'), 'utf8');
const input = source.slice(source.indexOf('async function handle_move('), source.indexOf('function animate_progress_bar('));
const listener = source.slice(source.indexOf('function stockfish_listener('), source.indexOf('function setup_options('));

(async () => {
    for (const [fen, from, to] of [
        ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7', 'a8'],
        ['4k3/8/8/8/8/8/p7/4K3 b - - 0 1', 'a2', 'a1']
    ]) for (const role of ['q', 'r', 'b', 'n']) {
        const board = new Chess(fen);
        const rendered = [];
        const context = vm.createContext({ chess: board, ground: { set() {} }, ground_set_moves() {}, ground_move(move) { rendered.push(move); } });
        require('./board_game_helper.cjs')(context);
        vm.runInContext(input + '\n' + listener, context);
        context.stockfish_listener(`bestmove ${from}${to}${role} ponder e8d7`);
        assert.equal(board.get(to).type, role, 'Keep the engine promotion choice');
        assert.equal(rendered.length, 1);
        assert.equal(rendered[0].promotion, role);
        const before = board.fen();
        for (const message of ['bestmove (none)', 'bestmove 0000', 'bestmove invalid', 'info depth 20', 'bestmove']) context.stockfish_listener(message);
        assert.equal(board.fen(), before);
        assert.equal(rendered.length, 1);
    }
    const board = new Chess();
    board.move('e4');
    let searches = 0;
    const context = vm.createContext({ chess: board, ground: { set() {} }, ground_set_moves() {}, ground_move() {}, ai_move() { searches++; } });
    require('./board_game_helper.cjs')(context);
    vm.runInContext(input, context);
    await context.handle_move('e2', 'e5');
    assert.equal(board.history().join(' '), 'e4');
    assert.equal(searches, 0, 'Illegal input must not start an engine search');
    await context.handle_move('e7', 'e5');
    assert.equal(board.history().join(' '), 'e4 e5');
    assert.equal(searches, 1);
    const castling = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const initial = castling.fen();
    castling.move('O-O'); castling.move('O-O-O');
    const state = { fen: castling.fen() };
    const rollback = vm.createContext({ chess: castling, ground: { set(update) { Object.assign(state, update); } },
        setup_move_handler() {}, handle_move() {} });
    require('./board_game_helper.cjs')(rollback, { options: {} });
    const takeback = source.slice(source.indexOf('function takeback()'), source.indexOf('function main('));
    vm.runInContext(takeback, rollback);
    rollback.takeback();
    assert.equal(castling.fen(), initial);
    assert.equal(state.fen, initial, 'Takeback restores both castling rooks and kings');
    assert.equal(state.turnColor, 'white');
    rollback.takeback();
    assert.equal(castling.fen(), initial, 'Takeback at the start is harmless');
    console.log('Stockfish move input: both colors, all engine promotions, invalid bestmoves and illegal user input passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
