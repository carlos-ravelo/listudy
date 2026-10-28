const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const remote = {};
const revisions = {};
let offline = false;
let hold;
let waiting;
let lastHydrationUrl;
const fetchMock = async (url, options = {}) => {
    if (offline) throw new Error('offline');
    if (url === '/api/progress' || url.startsWith('/api/progress?')) {
        lastHydrationUrl = url;
        const studyId = new URL(url, 'http://localhost').searchParams.get('study_id');
        const included = key => !studyId || !/_chapter_(stats|reviews)$/.test(key) ||
            key === `${studyId}_chapter_stats` || key === `${studyId}_chapter_reviews`;
        return { ok: true, json: async () => ({
            ...Object.fromEntries(Object.entries(remote).filter(([key]) => included(key))),
            _progress_revisions: Object.fromEntries(Object.entries(revisions).filter(([key]) => included(key)))
        }) };
    }
    const request = JSON.parse(options.body);
    if (hold) { waiting = hold; hold = null; await waiting; }
    if (request.revision !== (revisions[request.key] || '')) return { ok: false, status: 409,
        json: async () => ({ value: remote[request.key] || null, revision: revisions[request.key] || '' }) };
    remote[request.key] = request.value;
    revisions[request.key] = String(Number(revisions[request.key] || 0) + 1);
    return { ok: true, status: 200, json: async () => ({ revision: revisions[request.key] }) };
};
function storage() {
    const data = new Map();
    return { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: key => data.get(key) || null,
        setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}
function client(localStorage = storage(), user = '1') {
    const listeners = {};
    const context = vm.createContext({ ...require('ts-fsrs'), localStorage, logged_in: true,
        document: { getElementById: () => ({ dataset: { userId: user } }), querySelector: () => ({ getAttribute: () => 'csrf' }), addEventListener() {} },
        window: { dispatchEvent: event => (listeners[event.type] || []).forEach(callback => callback(event)), addEventListener(type, callback) { (listeners[type] ||= []).push(callback); } },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        fetch: fetchMock, setTimeout: () => 1, clearTimeout() {}, console });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/progress_merge.js'), 'utf8').replace(/^import .*\n/gm, '').replace(/export \{[^}]+\};/, ''), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/progress_database.js'), 'utf8').replace(/^export /gm, ''), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/storage_adapter.js'), 'utf8').replace(/^import .*\n/gm, '').replace('export const StorageAdapter', 'globalThis.StorageAdapter').replace(/^export /gm, ''), context);
    return { adapter: context.StorageAdapter, storage: localStorage };
}
const key = 'study_chapter_stats';
const state = (a, b) => JSON.stringify({ version: 1, chapters: { a: { attempts: a, errors: 0 }, ...(b ? { b: { attempts: b, errors: 0 } } : {}) } });
(async () => {
    const a = client();
    const b = client();
    await a.adapter.hydrate();
    await b.adapter.hydrate();
    a.adapter.getItem(key); b.adapter.getItem(key);
    a.adapter.setItem(key, state(1));
    b.adapter.setItem(key, JSON.stringify({ version: 1, chapters: { b: { attempts: 1, errors: 0 } } }));
    await Promise.all([a.adapter._flush(key), b.adapter._flush(key)]);
    assert.equal(JSON.parse(remote[key]).chapters.a.attempts, 1);
    assert.equal(JSON.parse(remote[key]).chapters.b.attempts, 1);
    a.adapter.setItem(key, state(2));
    await a.adapter._flush(key);
    assert.equal(JSON.parse(remote[key]).chapters.a.attempts, 2);
    assert.equal(JSON.parse(remote[key]).chapters.b.attempts, 1);
    // In-memory application snapshots must not discard chapters merged during a conflict.
    a.adapter.setItem(key, state(3));
    assert.equal(JSON.parse(a.adapter.getItem(key)).chapters.b.attempts, 1);
    offline = true;
    await a.adapter._flush(key);
    assert.equal(JSON.parse(a.storage.getItem('progress:user:1:' + key + ':sync')).pending, true);
    const reloaded = client(a.storage);
    assert.equal(await reloaded.adapter.hydrate(), false);
    assert.equal(JSON.parse(reloaded.adapter.getItem(key)).chapters.a.attempts, 3);
    offline = false;
    await reloaded.adapter.hydrate();
    await reloaded.adapter._flush(key);
    assert.equal(JSON.parse(remote[key]).chapters.a.attempts, 3);
    b.adapter.setItem(key, JSON.stringify({ version: 1, chapters: { a: { attempts: 1, errors: 0 }, b: { attempts: 2, errors: 0 } } }));
    await b.adapter.hydrate();
    assert.equal(JSON.parse(b.adapter.getItem(key)).chapters.a.attempts, 3);
    assert.equal(JSON.parse(b.adapter.getItem(key)).chapters.b.attempts, 2);
    await b.adapter._flush(key);
    assert.equal(JSON.parse(remote[key]).chapters.b.attempts, 2);
    let release;
    hold = new Promise(resolve => release = resolve);
    const pending = b.adapter._flush(key);
    const latest = JSON.parse(b.adapter.getItem(key)); latest.chapters.b.attempts++;
    b.adapter.setItem(key, JSON.stringify(latest));
    release(); await pending;
    assert.equal(JSON.parse(remote[key]).chapters.b.attempts, 3);
    assert.equal(JSON.parse(b.storage.getItem('progress:user:1:' + key + ':sync')).pending, false);
    const otherAccount = client(b.storage, '2');
    assert.equal(otherAccount.adapter.getItem(key), null);
    const unrelatedKey = 'unrelated_chapter_stats';
    const scoped = client();
    scoped.adapter.setItem(unrelatedKey, state(7));
    await scoped.adapter.whenSaved();
    const pendingMetadata = scoped.storage.getItem('progress:user:1:' + unrelatedKey + ':sync');
    remote.move_delay = 'fast';
    await scoped.adapter.hydrate('study');
    assert.equal(lastHydrationUrl, '/api/progress?study_id=study');
    assert.equal(JSON.parse(scoped.adapter.getItem(key)).chapters.a.attempts, 3);
    assert.equal(scoped.adapter.getItem('move_delay'), 'fast');
    assert.equal(scoped.storage.getItem('progress:user:1:' + unrelatedKey + ':sync'), pendingMetadata,
        'Scoped hydration must not replace another study\'s pending revision');
    assert.equal(JSON.parse(scoped.adapter.getItem(unrelatedKey)).chapters.a.attempts, 7);
    await scoped.adapter._flush(unrelatedKey);
    assert.equal(JSON.parse(remote[unrelatedKey]).chapters.a.attempts, 7);
    await scoped.adapter.hydrate('study & other');
    assert.equal(lastHydrationUrl, '/api/progress?study_id=study%20%26%20other');
    console.log('Two-device conflicts, offline reload, pending hydration, writes during requests and account isolation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
