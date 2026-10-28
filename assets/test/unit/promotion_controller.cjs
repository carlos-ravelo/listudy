const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let callbacks;
const context = vm.createContext({
    createPromotionPicker(options) {
        callbacks = options;
        return { open() {}, close() {}, destroy() {} };
    }
});
vm.runInContext(fs.readFileSync('assets/js/modules/board/promotion_controller.js', 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);

for (const color of ['white', 'black']) {
    const from = color === 'white' ? 'a7' : 'h2';
    const to = color === 'white' ? 'a8' : 'h1';
    for (const strings of [true, false]) {
        const legal = ['q', 'r', 'b', 'n'].map(promotion => strings ? from + to + promotion : { from, to, promotion });
        const chosen = [];
        let opened = 0, cancelled = 0, observed;
        const controller = context.createPromotionController({
            element: {},
            onPendingChange(move) { observed = move; },
            onOpen() { opened++; assert.ok(controller.pending); },
            onChoose(role, move) {
                assert.equal(controller.pending, null);
                assert.equal(observed, null);
                chosen.push([role, move.from, move.to]);
            },
            onCancel() { cancelled++; assert.equal(controller.pending, null); }
        });
        const request = { from, to, legal, color, orientation: color };
        assert.equal(controller.request({ ...request, to: 'a4' }), false);
        assert.equal(controller.request({ ...request, promotion: 'q' }), false);
        assert.equal(opened, 0);
        for (const role of ['q', 'r', 'b', 'n']) {
            assert.equal(controller.request(request), true);
            assert.equal(controller.request({ ...request, from: 'b7' }), true);
            controller.choose('k');
            assert.ok(controller.pending);
            callbacks.onChoose(role);
            callbacks.onChoose(role);
            assert.deepEqual(chosen.at(-1), [role, from, to]);
        }
        assert.equal(opened, 4);
        assert.equal(chosen.length, 4);
        controller.request(request);
        callbacks.onCancel();
        callbacks.onCancel();
        assert.equal(cancelled, 1);
        controller.request(request);
        controller.close();
        callbacks.onChoose('q');
        assert.equal(chosen.length, 4);
        assert.equal(cancelled, 1);
        controller.request(request);
        controller.destroy();
        callbacks.onChoose('q');
        assert.equal(controller.pending, null);
        assert.equal(chosen.length, 4);
    }
}
const unavailable = context.createPromotionController({ element: null });
assert.equal(unavailable.request({ from: 'a7', to: 'a8', legal: ['a7a8q'] }), false);
assert.equal(unavailable.pending, null);
console.log('Promotion controller: both colors, legal move formats, all roles, cancellation and reset passed');
