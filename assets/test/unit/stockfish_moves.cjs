const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const source = fs.readFileSync(path.join(__dirname, '../../js/pages/training/play_stockfish.js'), 'utf8').replace(/^import .*;\n/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));

function mount(hash = '') {
    const events = new EventTarget(), nodes = new Map(), engines = [], boards = [], tasks = new Map(), errors = [];
    let timer = 0;
    function node(id) {
        if (!nodes.has(id)) nodes.set(id, Object.assign(new EventTarget(), { style: {}, innerText: '' }));
        return nodes.get(id);
    }
    const context = vm.createContext({
        require, document: { location: { hash }, getElementById: node },
        addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
        setTimeout(callback) { tasks.set(++timer, callback); return timer; }, clearTimeout(id) { tasks.delete(id); },
        console: { error: (...args) => errors.push(args) },
        turn_color: chess => chess.turn() === 'w' ? 'white' : 'black',
        setup_chess(fen) { context.chess = new Chess(fen); },
        initial_fen(chess) { const copy = new Chess(chess.fen()); copy.load_pgn(chess.pgn()); while (copy.undo()); return copy.fen(); },
        setup_ground() {
            const state = { destroyed: false };
            context.ground = { set(update) { Object.assign(state, update); }, destroy() { state.destroyed = true; } };
            boards.push(state);
        },
        setup_move_handler(handler) { boards.at(-1).input = handler; }, resize_ground() {}, onresize() {}, playMoveSound() {},
        set_text(id, message) { node(id).innerText = message; }, clear_all_text() { node('error').innerText = ''; }, error_div: 'error',
        enginePosition(initialFen, chess) { return { initialFen, moves: chess.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')) }; },
        createUciEngine() {
            const engine = { searches: [], disposed: false,
                search(state, options) { return new Promise((resolve, reject) => engine.searches.push({ state, options, resolve, reject })); },
                dispose() { engine.disposed = true; }
            };
            engines.push(engine); return engine;
        }
    });
    context.window = context;
    require('./board_game_helper.cjs')(context);
    for (const name of ['page_scope', 'training_lifecycle']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules', name + '.js'), 'utf8')
            .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
    }
    vm.runInContext(source, context);
    return { context, engines, boards, tasks, errors, node,
        click(id) { node(id).dispatchEvent(new Event('click')); },
        transition(name, persisted) { const event = new Event(name); event.persisted = persisted; events.dispatchEvent(event); }
    };
}

(async () => {
    for (const [fen, from, to] of [
        ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7', 'a8'],
        ['4k3/8/8/8/8/8/p7/4K3 b - - 0 1', 'a2', 'a1']
    ]) for (const role of ['q', 'r', 'b', 'n']) {
        const page = mount(`#${fen};sf`);
        const request = page.engines[0].searches[0];
        assert.equal(request.options.elo, null, 'Keep full-strength play');
        request.resolve({ uci: from + to + role });
        await flush();
        assert.equal(page.context.chess.get(to).type, role, 'Preserve engine underpromotion for either color');
        assert.equal(page.boards[0].fen, page.context.chess.fen());
        page.transition('pagehide', false);
    }
    for (const uci of ['(none)', '0000', 'invalid', undefined]) {
        const invalid = mount();
        invalid.boards[0].input('e2', 'e4');
        invalid.engines[0].searches[0].resolve({ uci });
        await flush();
        assert.equal(invalid.context.chess.history().join(' '), 'e4', 'Malformed or absent replies cannot change history');
        assert.match(invalid.node('error').innerText, /Reset or take back/);
        invalid.transition('pagehide', false);
    }
    const page = mount();
    page.boards[0].input('e2', 'e5');
    assert.equal(page.engines[0].searches.length, 0, 'Illegal input starts no search');
    page.boards[0].input('e2', 'e4');
    const pending = page.engines[0].searches[0];
    assert.equal(pending.state.moves.join(' '), 'e2e4');
    page.boards[0].input('e7', 'e5');
    page.context.ai_move();
    assert.equal(page.engines[0].searches.length, 1, 'Repeated input while thinking cannot move or search');
    assert.equal(page.context.chess.history().join(' '), 'e4');
    const oldInput = page.boards[0].input;
    page.click('takeback');
    assert.equal(page.context.chess.history().length, 0, 'Takeback during search undoes the unpaired player ply');
    assert.equal(page.engines[0].disposed, true);
    assert.equal(page.boards[0].destroyed, true);
    oldInput('e2', 'e4');
    pending.resolve({ uci: 'e2e4' }); // Legal again, but belongs to the cancelled search.
    await flush();
    assert.equal(page.context.chess.history().length, 0);
    assert.equal(page.boards.at(-1).movable.color, 'white');

    page.boards.at(-1).input('e2', 'e4');
    const resetSearch = page.engines.at(-1).searches[0];
    page.click('reset_black');
    const blackSearch = page.engines.at(-1).searches[0];
    resetSearch.reject(new Error('Old worker failed'));
    await flush();
    assert.equal(page.node('error').innerText, '', 'Cancelled failures cannot overwrite current feedback');
    blackSearch.resolve({ uci: 'e2e4' });
    await flush();
    assert.equal(page.context.chess.history().join(' '), 'e4');
    assert.equal(page.boards.at(-1).movable.color, 'black');

    page.boards.at(-1).input('e7', 'e5');
    const failure = page.engines.at(-1).searches.at(-1);
    failure.reject(new Error('Engine unavailable'));
    await flush();
    assert.match(page.node('error').innerText, /Reset or take back/);
    page.click('takeback');
    assert.equal(page.context.chess.history().join(' '), 'e4');
    assert.equal(page.node('error').innerText, '');

    page.boards.at(-1).input('e7', 'e5');
    const hiddenSearch = page.engines.at(-1).searches[0];
    page.transition('pagehide', true);
    assert.equal(page.engines.at(-1).disposed, true);
    assert.equal(page.tasks.size, 0);
    hiddenSearch.resolve({ uci: 'g1f3' });
    await flush();
    assert.equal(page.context.chess.history().join(' '), 'e4 e5');
    const beforeRestore = page.engines.length;
    page.transition('pageshow', true);
    assert.equal(page.engines.length, beforeRestore + 1);
    const restored = page.engines.at(-1).searches[0];
    assert.equal(restored.state.moves.join(' '), 'e2e4 e7e5', 'Cached return resumes the existing game');
    restored.resolve({ uci: 'g1f3' });
    await flush();
    assert.equal(page.context.chess.history().join(' '), 'e4 e5 Nf3');
    page.transition('pagehide', false);
    const enginesBeforeClick = page.engines.length;
    page.click('reset_white');
    assert.equal(page.engines.length, enginesBeforeClick, 'Permanent navigation removes controls');

    const castle = mount('#r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1;p');
    const initial = castle.context.chess.fen();
    castle.boards[0].input('e1', 'g1');
    castle.engines[0].searches[0].resolve({ uci: 'e8c8' });
    await flush();
    castle.click('takeback');
    assert.equal(castle.context.chess.fen(), initial);
    assert.equal(castle.boards.at(-1).fen, initial, 'Completed-turn takeback restores both castling rooks and kings');
    const count = castle.engines.length;
    castle.click('takeback');
    assert.equal(castle.engines.length, count, 'Takeback at the start is harmless');
    castle.transition('pagehide', false);
    console.log('Stockfish adapter: promotions, input gating, reset/undo races, failures and cached-page lifecycle passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
