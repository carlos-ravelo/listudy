const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
const source = read('blind_tactics.js');
const handlers = source.slice(source.indexOf('function get_current_chess()'), source.indexOf('\n/*', source.indexOf('async function handle_click(')));

(async () => {
    for (const { color, fen, moves, start } of [
        { color: 'white', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], start: 2 },
        { color: 'black', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], start: 1 },
        { color: 'white', fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', moves: ['a8=N'], start: 0 },
        { color: 'black', fen: '4k3/8/8/8/8/8/p7/4K3 b - - 0 1', moves: ['a1=N'], start: 0 }
    ]) {
        const initial = fen ? new Chess(fen) : new Chess();
        const authored = new Chess(initial.fen());
        for (const san of moves) authored.move(san);
        const visibleFen = initial.fen();
        const state = { fen: visibleFen, orientation: color, movable: {} };
        const progress = [];
        const context = vm.createContext({
            Chess, Map, chess: authored, current_chess: new Chess(initial.fen()), current_move: start,
            initial_fen: visibleFen, clicked_piece: null, highlighted_squares: [], finished: false,
            attempts: { pending: false, reset() {} },
            visualization: { destinations: { checked: false }, help() {}, tracker: {
                current: { assisted: false, errors: 0 }, decision(correct) { progress.push(correct); },
                end(solved, assisted) { progress.push({ solved, assisted }); }
            } },
            ground: { selectSquare() {}, setShapes() {}, redrawAll() {}, set(update) {
                const { movable, ...fields } = update;
                Object.assign(state, fields);
                if (movable) Object.assign(state.movable, movable);
            } },
            document: { getElementById: () => ({ classList: { remove() {} } }) },
            localStorage: { getItem: () => '0', setItem() {} },
            i18n: {}, success_div: 'success', info_div: 'info', clear_all_text() {}, set_text() {}, setup_move_text() {}
        });
        context.window = context;
        require('./chess_moves_helper.cjs')(context);
        vm.runInContext(read('modules/board_interaction.js').replace(/^export /gm, ''), context);
        context.ground_legal_moves = position => context.legalDestinations(position.moves({ verbose: true }));
        vm.runInContext(handlers, context);
        context.current_chess = context.get_current_chess();
        context.legal_moves = context.ground_legal_moves(context.current_chess);
        require('./line_exercise_helper.cjs')(context, {
            moves: authored.history({verbose: true}).slice(context.current_move).map(context.moveToUci), format: 'uci',
            validator: { validate() { assert.fail('Authored moves, including underpromotion, need no engine'); } },
            getPosition: () => context.current_chess, applyMove: uci => context.playUciMove(context.current_chess, uci)
        });
        context.blockBoardMoves(context.ground);
        for (let step = 0; !context.finished && step <= moves.length; step++) {
            const expected = authored.history({ verbose: true })[context.current_move];
            await context.handle_click(expected.from);
            await context.handle_click(expected.to);
            assert.equal(state.orientation, color);
            assert.equal(state.movable.color, undefined, 'Blind accepts square selections while piece movement stays disabled');
            assert.equal(state.movable.dests.size, 0);
            if (!context.finished) {
                assert.equal(state.fen, visibleFen, 'Logical progress must not reveal the hidden position');
                assert.notEqual(context.current_chess.fen(), visibleFen);
            }
        }
        assert.equal(context.finished, true, 'Complete the authored exercise');
        assert.equal(state.fen, authored.fen(), 'Reveal the final logical position on completion');
        assert.equal(state.turnColor, authored.turn() === 'w' ? 'white' : 'black');
        assert.equal(state.check, authored.in_check());
        assert(progress.slice(0, -1).every(value => value === true));
        assert.deepEqual(progress.at(-1), { solved: true, assisted: false });
    }
    console.log('Blind board state: both orientations, hidden logical progress, authored underpromotion, click input and final reveal passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
