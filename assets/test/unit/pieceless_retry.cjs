const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
const source = read('pages/training/pieceless_tactics.js');
const handler = source.slice(source.indexOf('async function play_move('), source.indexOf('function handle_move('));

(async () => {
    for (const color of ['white', 'black']) for (const status of ['rejected', 'unknown']) {
        const chess = new Chess();
        if (color === 'black') chess.move('e4');
        const sequence = color === 'white' ? ['e2e4', 'e7e5', 'g1f3'] : ['e7e5', 'g1f3', 'b8c6'];
        const from = color === 'white' ? 'd2' : 'd7';
        const to = color === 'white' ? 'd4' : 'd5';
        const before = chess.fen();
        const decisions = [];
        const state = { turnColor: color === 'white' ? 'black' : 'white', check: true,
            movable: { color }, fen: 'dragged-position' };
        const ground = { set(update) {
            const { movable, ...fields } = update;
            Object.assign(state, fields);
            if (movable) Object.assign(state.movable, movable);
        } };
        const context = vm.createContext({
            chess, fen: before, solution: sequence, ground, Map,
            attempts: { pending: false, validate: async () => ({ status }) },
            enginePosition: () => ({}),
            clear_all_text() {}, set_text() {}, show_history() {},
            i18n: {}, info_div: 'info', error_div: 'error', success_div: 'success',
            visualization: { tracker: { decision(value) { decisions.push(value); } } },
            pieceMask: { move() {} },
            ground_move(move, board) { state.turnColor = board.turn() === 'w' ? 'white' : 'black'; }
        });
        require('./board_game_helper.cjs')(context, { options: { check: false },
            onMove(move, position) { context.pieceMask.move(move); context.ground_move(move, position); } });
        vm.runInContext(read('modules/board_interaction.js').replace(/^export /gm, ''), context);
        require('./line_exercise_helper.cjs')(context, { applyOptions: {} });
        vm.runInContext('let finished = false;\n' + handler, context);
        await context.play_move(from, to);
        assert.equal(state.fen, before);
        assert.equal(state.turnColor, color);
        assert.equal(state.movable.color, color);
        assert.equal(state.check, false, 'Retry must not reveal check');
        assert(state.movable.dests.size > 0);
        assert.deepEqual(decisions, status === 'rejected' ? [false] : []);
        const next = sequence[0];
        await context.play_move(next.slice(0, 2), next.slice(2, 4));
        assert.equal(state.turnColor, color);
        assert.equal(state.movable.color, color);
        assert.equal(chess.history().slice(-2).join(' '), color === 'white' ? 'e4 e5' : 'e5 Nf3');
        assert.equal(decisions.at(-1), true);
    }
    console.log('Pieceless retries: rejected and unknown moves restore both colors without revealing check');
})().catch(error => { console.error(error); process.exitCode = 1; });
