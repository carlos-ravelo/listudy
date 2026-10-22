const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const values = new Map(), timers = new Map(), requests = [], reports = [];
let timerId = 0;
const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
};
const context = vm.createContext({
    localStorage: storage,
    document: { querySelector: () => ({ getAttribute: () => 'csrf' }) },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) { return new Promise(resolve => requests.push({ url, options, resolve })); }
});
for (const file of ['request_json.js', 'study/collection_store.js', 'study/collection_account.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules', file), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
}
const CollectionStore = vm.runInContext('CollectionStore', context);
const CollectionAccount = vm.runInContext('CollectionAccount', context);
const store = new CollectionStore(storage, 'listudy_collections:user:1');
const account = new CollectionAccount(store, '1', message => reports.push(message));
const remote = { active: 'Default', collections: { Default: [] } };
const respond = (data, status = 200) => requests.at(-1).resolve({ status, ok: status < 400, json: async () => data });
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

(async () => {
    const initialized = account.initialize();
    assert.equal(requests[0].options.method, 'GET');
    respond({ revision: 'r1', data: remote });
    await initialized;
    assert.equal(account.ready, true);
    store.add({ pgn: '1. e4 *', title: 'Alpha' });
    const saving = account.flush();
    assert.equal(requests[1].options.method, 'PUT');
    assert.equal(requests[1].options.headers['x-csrf-token'], 'csrf');
    assert.equal(JSON.parse(requests[1].options.body).revision, 'r1');
    store.add({ pgn: '1. d4 *', title: 'Beta' });
    respond({ revision: 'r2' });
    await nextTurn();
    assert.equal(requests.length, 3, 'A later local edit requires a new snapshot after the first save');
    const newer = JSON.parse(requests[2].options.body);
    assert.equal(newer.revision, 'r2');
    assert.equal(newer.data.collections.Default.length, 2);
    respond({ revision: 'r3' });
    await saving;
    assert.equal(account.dirty, false);
    assert.equal(storage.getItem(account.dirtyKey), null);
    assert.equal(account.revision, 'r3');
    assert.equal(timers.size, 0);

    store.rename('Local draft');
    const localDraft = storage.getItem(store.key);
    const conflict = account.flush();
    respond({ error: 'Changed elsewhere' }, 409);
    await assert.rejects(conflict, { name: 'JsonRequestError', status: 409, message: 'Changed elsewhere' });
    assert.equal(account.blocked, true);
    assert.equal(account.dirty, true);
    assert.equal(account.revision, 'r3');
    assert.equal(storage.getItem(store.key), localDraft);
    assert.equal(storage.getItem(account.dirtyKey), 'true');
    const afterConflict = requests.length;
    await assert.rejects(account.flush(), /Reload saved collections/);
    assert.equal(requests.length, afterConflict, 'Conflicts block subsequent writes without retrying');

    const reload = account.reload();
    respond({ revision: 'r4', data: remote });
    await reload;
    assert.equal(account.blocked, false);
    assert.equal(account.dirty, false);
    assert.equal(store.read().active, 'Default');
    store.add({ pgn: '1. c4 *', title: 'Gamma' });
    const failed = account.flush();
    requests.at(-1).resolve({ ok: false, status: 502, json: async () => { throw new SyntaxError('HTML'); } });
    await assert.rejects(failed, { name: 'JsonRequestError', status: 502,
        message: 'Could not save collections to your account. Your local copy is kept.' });
    assert.equal(account.blocked, false);
    assert.equal(account.dirty, true);
    assert.equal(store.read().collections.Default[0].title, 'Gamma');
    assert.equal(account.revision, 'r4');
    const retry = account.flush();
    respond({ revision: 'r5' });
    await retry;
    assert.equal(account.dirty, false);
    assert.equal(reports.at(-1), 'Saved to your account');

    store.rename('Offline draft');
    const unreadableConflict = account.flush();
    requests.at(-1).resolve({ ok: false, status: 409, json: async () => { throw new SyntaxError('HTML'); } });
    await assert.rejects(unreadableConflict, { name: 'JsonRequestError', status: 409 });
    assert.equal(account.blocked, true, 'Even an unreadable 409 must prevent overwriting remote changes');
    const offlineDraft = storage.getItem(store.key);
    const resumed = new CollectionAccount(new CollectionStore(storage, store.key), '1', message => reports.push(message));
    const initializeConflict = resumed.initialize();
    respond({ revision: 'other-tab', data: remote });
    await assert.rejects(initializeConflict, /Collections changed elsewhere/);
    assert.equal(resumed.blocked, true);
    assert.equal(resumed.ready, false);
    assert.equal(storage.getItem(store.key), offlineDraft);
    assert.equal(storage.getItem(account.dirtyKey), 'true');
    const disposeStore = new CollectionStore(storage, 'listudy_collections:user:dispose');
    const disposable = new CollectionAccount(disposeStore, 'dispose', () => {});
    disposable.ready = true;
    disposeStore.create('Pending draft');
    assert(timers.has(disposable.timer));
    disposable.destroy();
    assert(!timers.has(disposable.timer));
    assert.equal(disposeStore.onSave, null);
    assert.equal(storage.getItem(disposable.dirtyKey), 'true', 'Disposal preserves the durable pending draft');
    console.log('Collection sync: queued snapshots, revisions, 409 locks, local drafts, explicit reload and failed-save recovery passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
