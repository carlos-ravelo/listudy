const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../js/modules/study/visualization.js'), 'utf8');
    const { visualizationLevel } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
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
    console.log('Visualization progression passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
