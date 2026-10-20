const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ require });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/study_move_tree.js'), 'utf8').replace(/^export /gm, ''), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/position_context.js'), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/, ''), context);
const root = [{ move: 'e4', children: [{ move: 'e5', children: [] },
    { move: 'c5', children: [{ move: 'Nf3', children: [{ move: 'd6', children: [
        { move: 'd4', children: [{ move: 'cxd4', children: [{ move: 'Nxd4', children: [] }] }] }
    ] }] }] }] }];
async function run({ path: route, count, fen, tree = root, cancelAt }) {
    let position;
    let prefix;
    const moves = [];
    let current = true;
    let pauses = 0;
    const completed = await context.replayPositionContext({ root: tree, fen, path: route, count,
        present(chess, initial) { position = chess; prefix = initial; },
        advance(san) { assert(position.move(san)); moves.push(san); },
        pause: async () => { if (++pauses === cancelAt) current = false; },
        isCurrent: () => current });
    return { completed, position, prefix, moves };
}
(async () => {
    const route = [0, 1, 0, 0, 0, 0];
    const brief = await run({ path: route, count: 4 });
    assert.equal(brief.prefix.join(','), '0,1');
    assert.deepEqual(brief.moves, ['Nf3', 'd6', 'd4', 'cxd4']);
    assert.equal(brief.position.fen(), context.readChapterPosition(root, undefined, route).fen());
    assert.equal(brief.position.history().includes('Nxd4'), false);
    const full = await run({ path: route, count: route.length });
    assert.deepEqual(full.moves, ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4']);
    const direct = await run({ path: route, count: 0 });
    assert.deepEqual(direct.moves, []);
    assert.equal(direct.position.fen(), full.position.fen());
    const beginning = await run({ path: [], count: 4 });
    assert.equal(beginning.completed, true);
    assert.equal(beginning.moves.length, 0);
    const canceled = await run({ path: route, count: 4, cancelAt: 2 });
    assert.equal(canceled.completed, false);
    assert.deepEqual(canceled.moves, ['Nf3']);
    const invalid = await run({ path: [0, 9], count: 4 });
    assert.equal(invalid.completed, false);
    assert.equal(invalid.position, undefined);
    const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    const promotionTree = [{ move: 'a8=Q+', children: [{ move: 'Kd7', children: [] }] }];
    const promotion = await run({ path: [0], count: 4, fen, tree: promotionTree });
    assert.deepEqual(promotion.moves, ['a8=Q+']);
    assert.equal(promotion.position.history().includes('Kd7'), false);
    console.log('Context replay branches, four-ply limit, full replay, FEN, promotion and cancellation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
