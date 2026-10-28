const assert = require('node:assert/strict');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function harness(moves, { format = 'san', fen = new Chess().fen(), validator = null } = {}) {
    const effects = [];
    const context = vm.createContext({ chess: new Chess(fen), fen, ground: { set() {} } });
    require('./board_game_helper.cjs')(context, { onMove: move => effects.push(move.san) });
    const exercise = require('./line_exercise_helper.cjs')(context, { moves, format, validator });
    return { context, exercise, effects };
}

(async () => {
    for (const format of ['san', 'uci']) {
        const { context, exercise, effects } = harness(format === 'san' ? ['e4', 'e5', 'Nf3'] : ['e2e4', 'e7e5', 'g1f3'], { format });
        assert.equal((await exercise.play('e2e5')).status, 'illegal');
        assert.equal((await exercise.play('d4')).status, 'rejected');
        assert.equal(context.chess.history().length, 0);
        const first = await exercise.play({ from: 'e2', to: 'e4' });
        assert.equal(first.move.san, 'e4');
        assert.equal(first.reply.san, 'e5');
        assert.equal(first.complete, false);
        assert.equal(exercise.remaining.join(' '), 'g1f3');
        const final = await exercise.play('Nf3');
        assert.equal(final.complete, true);
        assert.equal(exercise.complete, true);
        assert.equal(final.reply, null);
        assert.deepEqual(effects, ['e4', 'e5', 'Nf3']);
        assert.equal(await exercise.play('Nc6'), null, 'Completion prevents extra commits or duplicate rewards');
    }
    const terminal = harness(['e4', 'e5']);
    assert.equal((await terminal.exercise.play('e4')).complete, true);
    assert.equal(terminal.context.chess.history().join(' '), 'e4');
    assert.equal(terminal.exercise.remaining.join(' '), 'e7e5', 'Keep an authored terminal reply for reveal');
    for (const [fen, from, to] of [
        ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7', 'a8'],
        ['4k3/8/8/8/8/8/p7/4K3 b - - 0 1', 'a2', 'a1']
    ]) for (const promotion of ['q', 'r', 'b', 'n']) {
        const { context, exercise } = harness([from + to + promotion], { format: 'uci', fen });
        assert.equal((await exercise.play({ from, to, promotion })).complete, true);
        assert.equal(context.chess.get(to).type, promotion);
    }
    for (const status of ['rejected', 'unknown']) {
        const { context, exercise } = harness(['e4', 'e5', 'Nf3'], { validator: { validate: async () => ({ status }) } });
        let checks = 0;
        assert.equal((await exercise.play('d4', { onChecking() { checks++; } })).status, status);
        assert.equal(checks, 1);
        assert.equal(context.chess.history().length, 0);
        assert.equal(exercise.remaining.length, 3);
        assert.equal((await exercise.play('e4')).status, 'accepted', 'An inconclusive or rejected move permits retry');
    }
    const alternative = harness(['e4', 'e5', 'Nf3'], { validator: {
        validate: async (state, expected, played, remaining) => {
            assert.equal(state.initialFen, alternative.context.fen);
            assert.equal(expected, 'e2e4'); assert.equal(played, 'd2d4'); assert.equal(remaining, 3);
            return { status: 'accepted', line: ['d2d4', 'd7d5', 'c2c4'] };
        }
    } });
    assert.equal((await alternative.exercise.play('d4')).reply.san, 'd5');
    assert.equal(alternative.context.chess.history().join(' '), 'd4 d5');
    assert.equal(alternative.exercise.remaining.join(' '), 'c2c4');
    for (const line of [undefined, [], ['e2e4'], ['d2d4', 'e2e4']]) {
        const malformed = harness(['e4'], { validator: { validate: async () => ({ status: 'accepted', line }) } });
        assert.equal((await malformed.exercise.play('d4')).status, 'unknown');
        assert.equal(malformed.context.chess.history().length, 0);
    }
    const offline = harness(['e4'], { validator: { validate: async () => { throw Error('Unavailable'); } } });
    assert.equal((await offline.exercise.play('d4')).status, 'unknown');
    const requests = [], reset = { count: 0 };
    const race = harness(['e4'], { validator: {
        reset() { reset.count++; },
        validate() { const request = deferred(); requests.push(request); return request.promise; }
    } });
    const old = race.exercise.play('d4');
    assert.equal(await race.exercise.play('d4'), null);
    assert.equal(requests.length, 1);
    race.exercise.reset({ initialFen: race.context.fen, moves: ['e4'], format: 'san' });
    const newer = race.exercise.play('d4');
    requests[0].resolve({ status: 'accepted', line: ['d2d4'] });
    assert.equal(await old, null);
    assert.equal(race.exercise.pending, true, 'An old result must not unlock a new request');
    race.exercise.stop();
    requests[1].resolve({ status: 'accepted', line: ['d2d4'] });
    assert.equal(await newer, null);
    assert.equal(race.context.chess.history().length, 0);
    assert.equal(reset.count, 3);
    const delay = deferred();
    const delayed = harness(['e4', 'e5', 'Nf3']);
    const reply = delayed.exercise.play('e4', { beforeReply: () => delay.promise });
    assert.equal(delayed.context.chess.history().join(' '), 'e4');
    assert.equal(delayed.exercise.pending, true);
    delayed.context.chess = new Chess();
    delayed.exercise.reset({ initialFen: delayed.context.fen, moves: ['d4'], format: 'san' });
    delay.resolve();
    assert.equal(await reply, null);
    assert.equal(delayed.context.chess.history().length, 0, 'Do not apply a delayed reply after restart');
    assert.equal(delayed.exercise.remaining.join(' '), 'd2d4');
    const unchanged = harness(['e4']);
    const revision = unchanged.exercise.revision;
    assert.throws(() => unchanged.exercise.reset({ moves: ['e2e5'] }), /Invalid exercise/);
    assert.equal(unchanged.exercise.revision, revision, 'Invalid input must not partially reset the session');
    console.log('Line exercise: shared validation, authored/alternative replies, completion, promotions, retry and cancellation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
