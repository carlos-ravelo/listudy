const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const moduleSource = fs.readFileSync(path.join(__dirname, '../../js/modules/tactic_attempts.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

(async () => {
    const requests = [];
    let resets = 0;
    const context = vm.createContext({ createTacticAlternatives: () => ({
        validate() { const request = deferred(); requests.push(request); return request.promise; },
        reset() { resets++; }
    }) });
    vm.runInContext(moduleSource, context);
    const attempts = context.createTacticAttempts();
    const first = attempts.validate();
    assert.equal(attempts.pending, true);
    assert.equal(await attempts.validate(), null, 'Repeated input must not start another analysis');
    assert.equal(requests.length, 1);
    attempts.reset();
    const second = attempts.validate();
    requests[0].resolve({ status: 'accepted', line: ['d2d4'] });
    assert.equal(await first, null, 'Old accepted moves must not reach the restarted exercise');
    assert.equal(attempts.pending, true, 'An old completion must not unlock a newer request');
    const accepted = { status: 'accepted', line: ['e2e4'] };
    requests[1].resolve(accepted);
    assert.equal(await second, accepted);
    assert.equal(attempts.pending, false);
    for (const status of ['rejected', 'unknown']) {
        const result = attempts.validate();
        requests.at(-1).resolve({ status });
        assert.equal((await result).status, status);
        assert.equal(attempts.pending, false);
    }
    const failed = attempts.validate();
    requests.at(-1).reject(new Error('Unexpected failure'));
    await assert.rejects(failed, /Unexpected failure/);
    assert.equal(attempts.pending, false);
    assert.equal(resets, 1);

    // Run the real input handlers to ensure stale acceptance cannot mutate a mode.
    for (const mode of ['tactics', 'pieceless_tactics', 'blind_tactics']) {
        const board = new Chess();
        const authored = new Chess();
        for (const san of ['e4', 'e5', 'Nf3']) authored.move(san);
        const request = deferred();
        const mutations = [];
        const sandbox = vm.createContext({
            createTacticAlternatives: () => ({ validate: () => request.promise, reset() {} }),
            chess: mode === 'blind_tactics' ? authored : board,
            current_chess: board, current_move: 0, clicked_piece: 'd2',
            legal_moves: new Map([['d2', ['d4']]]), target: () => 'e4', piece_pos: () => 'e2',
            fen: board.fen(), color: 'white', to_play: ['e4', 'e5', 'Nf3'], solution: ['e2e4', 'e7e5', 'g1f3'],
            window: { initial_fen: board.fen() },
            enginePosition: () => ({}),
            ground: { set() {}, selectSquare() {} },
            clear_all_text() {}, set_text() {}, set_div_text() {},
            i18n: {}, info_div: 'info',
            visualization: { tracker: { decision() { mutations.push('decision'); } } },
            pieceMask: { move() { mutations.push('mask'); } },
            ground_move() { mutations.push('move'); }
        });
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/board_interaction.js'), 'utf8').replace(/^export /gm, ''), sandbox);
        vm.runInContext(moduleSource, sandbox);
        vm.runInContext('const attempts = createTacticAttempts(); let finished = false, busy = false, generation = 0;', sandbox);
        const source = fs.readFileSync(path.join(__dirname, '../../js', mode + '.js'), 'utf8');
        const start = mode === 'blind_tactics' ? 'async function handle_click(' : 'async function play_move(';
        const end = mode === 'blind_tactics' ? '\n/*' : mode === 'tactics' ? 'function setup_last_move(' : 'function handle_move(';
        vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))), sandbox);
        const action = mode === 'blind_tactics' ? sandbox.handle_click('d4') : sandbox.play_move('d2', 'd4', 'q');
        vm.runInContext('attempts.reset()', sandbox);
        request.resolve({ status: 'accepted', line: ['d2d4'] });
        await action;
        assert.deepEqual(board.history(), [], `${mode}: ignore old engine moves`);
        assert.deepEqual(mutations, [], `${mode}: ignore old scoring and rendering`);
    }
    console.log('Tactic attempts: concurrent input, reset races, retry, failure cleanup and three mode integrations passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
