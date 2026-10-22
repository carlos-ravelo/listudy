const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
    const scopeSource = fs.readFileSync(path.resolve(__dirname, '../../js/modules/page_scope.js'), 'utf8').replace(/^export /gm, '');
    const source = scopeSource + '\n' + fs.readFileSync(path.resolve(__dirname, '../../js/modules/study/visualization.js'), 'utf8').replace(/^import .*\n/gm, '');
    const { visualizationLevel, setupStudyVisualization } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const runs = {};
    const add = (target, values = {}) => {
        const id = String(Object.keys(runs).length);
        runs[id] = { id, at: Number(id), target, moves: target, completed: true, errors: 0, assisted: false, ...values };
    };
    assert.equal(visualizationLevel(), 1);
    for (let i = 0; i < 3; i++) add(1);
    assert.equal(visualizationLevel(runs), 2);
    for (let i = 0; i < 3; i++) add(2, { moves: 1 });
    assert.equal(visualizationLevel(runs), 2, 'Short PGN lines cannot promote a longer difficulty');
    for (let i = 0; i < 3; i++) add(2);
    assert.equal(visualizationLevel(runs), 4);
    add(4, { assisted: true, completed: false });
    assert.equal(visualizationLevel(runs), 2, 'Revealing pieces lowers the next adaptive challenge');
    add(2, { errors: 1 });
    assert.equal(visualizationLevel(runs), 1);
    for (let i = 0; i < 5; i++) add(1, { completed: false });
    assert.equal(visualizationLevel(runs), 1, 'Restarting or navigating cannot earn a clean run');
    // A trap must reveal the pieces without granting help or recording its
    // result until the PGN response has finished animating.
    const nodes = new Map();
    const node = name => {
        if (!nodes.has(name)) nodes.set(name, { setAttribute() {}, click() {} });
        return nodes.get(name);
    };
    const panel = { querySelector: node, dataset: {
        reveal: 'Show', hide: 'Hide', hidden: '%count%', memorize: '%count%',
        complete: 'Complete', history: '%clean%/%total%', reply: 'Reply'
    }};
    let piecesHidden = false, assisted = 0;
    const stats = {};
    global.document = {
        getElementById: id => id === 'study_visualization' ? panel : node(id),
        querySelector: () => ({ classList: { toggle(_name, value) { piecesHidden = value; } } })
    };
    global.window = {
        ground: { set() {}, setShapes() {}, setAutoShapes() {} },
        addEventListener() {}, dispatchEvent() {}
    };
    global.CustomEvent = class {};
    const controller = setupStudyVisualization({
        storage: { getItem: key => key === 'tactics_visualization' ? 'true' : '1', setItem() {} },
        getStats: () => stats, persist() {}, assist: () => assisted++, refresh() {}
    });
    node('button').onclick();
    assert.equal(piecesHidden, true);
    controller.previewFailure();
    assert.equal(piecesHidden, false, 'The refutation must remain visible');
    assert.equal(panel.hidden, true, 'Visualization controls cannot interrupt the trap');
    assert.equal(assisted, 0);
    assert.equal(stats.visualizationRuns, undefined);
    controller.decision(false, false);
    controller.finishFailure();
    const failedRun = Object.values(stats.visualizationRuns)[0];
    assert.equal(failedRun.errors, 1);
    assert.equal(failedRun.assisted, false);
    assert.equal(failedRun.completed, false);
    assert.equal(panel.hidden, true);
    controller.endFailure();
    assert.equal(panel.hidden, false);
    node('button').onclick();
    assert.equal(piecesHidden, true, 'Retry can begin another visualization run');
    controller.previewFailure();
    controller.reset();
    assert.equal(panel.hidden, false, 'Navigation clears a pending trap presentation');
    delete global.document;
    delete global.window;
    delete global.CustomEvent;
    console.log('Visualization progression and visible, unassisted trap failures passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
