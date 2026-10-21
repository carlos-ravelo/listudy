const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const factories = {}, requests = [];
const context = vm.createContext({
    Alpine: { data(name, factory) { factories[name] = factory; }, start() {} },
    window: {},
    document: { querySelector: () => ({ getAttribute: () => 'token' }) },
    fetch(url, options) {
        return new Promise(resolve => requests.push({ url, options, resolve }));
    }
});
for (const file of ['modules/request_json.js', 'study_maintenance.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
}
const controller = factories.studyMaintenance();
controller.$el = { dataset: {
    chapters: JSON.stringify([{ id: 'a', title: 'First', source_index: 0 }]),
    saveUrl: '/save', revision: 'original', saving: 'Saving', saved: 'Saved', saveError: 'No se pudo guardar'
} };
controller.init();

(async () => {
    await controller.save();
    assert.equal(requests.length, 0, 'Do not save an unchanged chapter list');
    controller.chapters[0].title = 'Draft';
    const conflict = controller.save();
    await controller.save();
    assert.equal(requests.length, 1, 'Do not duplicate an in-flight write');
    requests[0].resolve({ ok: false, status: 409, json: async () => ({ error: 'Study changed' }) });
    await conflict;
    assert.equal(controller.status, 'Study changed');
    assert.equal(controller.saving, false);
    assert.equal(controller.dirty, true);
    assert.equal(controller.chapters[0].title, 'Draft');
    assert.equal(controller.$el.dataset.revision, 'original');
    assert.equal(requests.length, 1);

    const failed = controller.save();
    requests[1].resolve({ ok: false, status: 502, json: async () => { throw new SyntaxError('HTML'); } });
    await failed;
    assert.equal(controller.status, 'No se pudo guardar');
    assert.equal(controller.dirty, true);
    assert.equal(controller.saving, false);

    const saved = controller.save();
    const body = JSON.parse(requests[2].options.body);
    assert.equal(body.revision, 'original');
    assert.equal(body.chapters[0].title, 'Draft');
    requests[2].resolve({ ok: true, status: 200, json: async () => ({ revision: 'next', chapters: body.chapters }) });
    await saved;
    assert.equal(controller.$el.dataset.revision, 'next');
    assert.equal(controller.status, 'Saved');
    assert.equal(controller.dirty, false);
    assert.equal(controller.saving, false);
    console.log('Maintenance writes preserve drafts and revisions on conflict or invalid responses, without duplicate requests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
