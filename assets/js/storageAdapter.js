import { mergeProgress } from './modules/study/progress_merge.js';
import { createProgressDatabase } from './modules/study/progress_database.js';

const managed = key => /_chapter_(stats|reviews)$/.test(key);
const tree = key => /^[\w-]+_tree$/.test(key);
const owner = () => document.getElementById('collection_modal')?.dataset.userId || document.querySelector('[data-progress-user]')?.dataset.progressUser || '';
const signedIn = () => Boolean(owner() && (typeof logged_in !== 'undefined' && logged_in || document.querySelector('[data-progress-user]')));
const scopeNow = () => ({user: String(owner()), signedIn: signedIn()});
const physicalKey = (key, scope) => managed(key) && scope.signedIn ? `progress:user:${scope.user}:${key}` : key;
const csrf = () => document.querySelector("meta[name='csrf-token']")?.getAttribute('content') || document.querySelector("input[name='_csrf_token']")?.value;
const merge = (base, local, remote, key, concurrent = false) => JSON.stringify(mergeProgress(base, local, remote, key, concurrent));
const empty = key => ({key, value: null, revision: '', base: null, pending: false});
const baseValue = record => record.pending ? record.base : record.value;

function browserStorage() {
    try { return globalThis.localStorage; }
    catch (_) { return {length: 0, getItem: () => null, setItem() { throw new Error('Local storage unavailable'); }}; }
}

export function createStorageAdapter({database = createProgressDatabase(), storage = browserStorage()} = {}) {
    const cache = new Map(), snapshots = new Map(), generations = new Map(), writes = new Map(), batches = new Map();
    const timers = new Map(), inflight = new Map(), transient = new Map(), failedKeys = new Set();
    let migration, storageFailed = false;
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('listudy-progress-v1') : null;
    const readSmall = key => { try { return storage.getItem(key); } catch (_) { return transient.get(key) ?? null; } };
    const notify = state => window.dispatchEvent(new CustomEvent('study-sync-status', {detail: {state: storageFailed ? 'storage-error' : state}}));
    const merged = (key, value) => window.dispatchEvent(new CustomEvent('study-progress-sync-merged', {detail: {key, value}}));
    function writeSmall(key, value) {
        transient.set(key, value);
        try { storage.setItem(key, value); return true; }
        catch (_) { storageFailed = true; notify('storage-error'); return false; }
    }
    function legacy(key) {
        const record = empty(key);
        record.value = readSmall(key);
        try {
            const meta = JSON.parse(readSmall(key + ':sync') || '{}');
            record.revision = meta.revision || '';
            record.pending = Boolean(meta.pending);
            record.base = record.pending ? meta.value || null : null;
        } catch (_) { record.pending = true; }
        return record;
    }
    function read(key) {
        if (!cache.has(key)) cache.set(key, legacy(key));
        return cache.get(key);
    }
    function adopt(record, generation, expected, logical, scope) {
        if ((generations.get(record.key) || 0) !== generation) return;
        cache.set(record.key, record);
        if (record.value !== expected && scope.user === scopeNow().user) merged(logical, record.value);
    }
    function persist(key, transform, expected, logical, scope) {
        const generation = generations.get(key) || 0;
        const tail = batches.get(key);
        if (tail && !tail.started) {
            tail.transforms.push(transform);
            Object.assign(tail, {generation, expected, logical, scope});
            return tail.promise;
        }
        const batch = {transforms: [transform], generation, expected, logical, scope, started: false};
        const previous = writes.get(key) || Promise.resolve();
        const operation = previous.then(async () => {
            batch.started = true;
            try {
                const result = await database.update(key, current => batch.transforms.reduce((record, change) => change(record), current));
                failedKeys.delete(key);
                storageFailed = failedKeys.size > 0;
                if (result) adopt(result, batch.generation, batch.expected, batch.logical, batch.scope);
                channel?.postMessage({key});
                return true;
            } catch (_) {
                // Never drop the newest in-memory value or skip cloud sync on disk failure.
                failedKeys.add(key);
                storageFailed = true;
                const record = cache.get(key);
                try {
                    storage.setItem(key, record.value);
                    storage.setItem(key + ':sync', JSON.stringify({revision: record.revision, value: baseValue(record), pending: record.pending}));
                } catch (_) { /* Existing disk contents are left intact. */ }
                notify('storage-error');
                return false;
            } finally {
                if (batches.get(key) === batch) batches.delete(key);
            }
        });
        batch.promise = operation;
        batches.set(key, batch);
        writes.set(key, operation);
        return operation;
    }
    async function migrate() {
        if (migration) return migration;
        migration = (async () => {
            const keys = [];
            for (let index = 0; index < storage.length; index++) keys.push(storage.key(index));
            for (const key of keys.filter(managed)) {
                const source = legacy(key);
                if (source.value === null) continue;
                const rawMeta = readSmall(key + ':sync');
                const saved = await database.update(key, current => {
                    if (!current) return source;
                    if (current.value === source.value || !source.pending) return current;
                    return {...current, value: merge(source.base, source.value, current.value, key), pending: true,
                        base: baseValue(current)};
                });
                if (saved.value !== source.value) await database.archive(key + ':migration', source.value);
                const verified = await database.get(key);
                if (JSON.stringify(verified) !== JSON.stringify(saved)) throw new Error('Progress migration verification failed');
                // Remove only the exact versions copied; an older open tab may have written again.
                if (readSmall(key) === source.value && readSmall(key + ':sync') === rawMeta) {
                    storage.removeItem(key);
                    storage.removeItem(key + ':sync');
                }
            }
            for (const key of keys.filter(key => tree(key) || /_chapter_(stats|reviews):(backup|legacy-backup|sync)$/.test(key))) {
                const value = readSmall(key);
                if (value === null) continue;
                const primary = key.replace(/:(backup|legacy-backup|sync)$/, '');
                const current = await database.get(primary);
                if (value !== current?.value && value !== current?.base) await database.archive(key, value);
                if (readSmall(key) === value) storage.removeItem(key);
            }
        })().catch(error => { migration = null; throw error; });
        return migration;
    }
    async function ready(studyId) {
        const scope = scopeNow();
        try {
            await migrate();
            const prefix = scope.signedIn ? `progress:user:${scope.user}:` : '';
            const records = studyId
                ? await Promise.all(['stats', 'reviews'].map(kind => database.get(physicalKey(`${studyId}_chapter_${kind}`, scope))))
                : (await database.list(prefix)).filter(record => managed(record.key) && (scope.signedIn || !record.key.startsWith('progress:user:')));
            for (const record of records.filter(Boolean)) {
                if (!generations.has(record.key)) cache.set(record.key, record);
            }
            storageFailed = failedKeys.size > 0;
            return true;
        } catch (_) { storageFailed = true; notify('storage-error'); return false; }
    }
    if (channel) channel.onmessage = async event => {
        const physical = event.data?.key, scope = scopeNow();
        const prefix = `progress:user:${scope.user}:`;
        if (!cache.has(physical) || storageFailed || (scope.signedIn ? !physical.startsWith(prefix) : physical.startsWith('progress:user:'))) return;
        try {
            await (writes.get(physical) || Promise.resolve());
            const generation = generations.get(physical) || 0;
            const expected = read(physical).value;
            const record = await database.get(physical);
            if (record) adopt(record, generation, expected, scope.signedIn ? physical.slice(prefix.length) : physical, scope);
        } catch (_) { /* Another tab cannot invalidate this tab's local progress. */ }
    };
    const adapter = {
        ready,
        async whenSaved() { return (await Promise.all([...writes.values()])).every(Boolean); },
        getItem(key) {
            if (!managed(key)) return readSmall(key);
            const physical = physicalKey(key, scopeNow());
            const value = read(physical).value;
            snapshots.set(physical, value);
            return value;
        },
        acceptSnapshot(key, value) { snapshots.set(physicalKey(key, scopeNow()), value); },
        setItem(key, input) {
            const scope = scopeNow();
            if (tree(key)) return; // PGN trees are reconstructed, never written per move.
            const value = String(input);
            if (!managed(key)) {
                writeSmall(key, value);
                adapter._syncToCloud(key, value);
                return;
            }
            const physical = physicalKey(key, scope), current = read(physical);
            const before = current.value;
            const combined = before && before !== snapshots.get(physical) ? merge(snapshots.get(physical), value, before, key) : value;
            snapshots.set(physical, value);
            if (combined === before) return;
            generations.set(physical, (generations.get(physical) || 0) + 1);
            cache.set(physical, {...current, value: combined, base: baseValue(current), pending: true});
            persist(physical, latest => {
                latest ||= current;
                const result = latest.value && latest.value !== before ? merge(before, combined, latest.value, key, true) : combined;
                return {...latest, value: result, base: baseValue(latest), pending: true};
            }, combined, key, scope);
            adapter._syncToCloud(key, combined);
        },
        async legacyTree(key) {
            try { return (await database.get(key, 'archive'))?.value || readSmall(key); }
            catch (_) { return readSmall(key); }
        },
        // Reconciliation needs one recovery copy, not a new full copy on every visit.
        async backup(key) {
            const physical = physicalKey(key, scopeNow());
            const value = read(physical).value;
            if (!value) return true;
            try {
                if (!(await database.get(physical + ':reconciliation', 'archive'))) await database.archive(physical + ':reconciliation', value);
                return true;
            } catch (_) { storageFailed = true; notify('storage-error'); return false; }
        },
        async hydrate(studyId) {
            await ready(studyId); // Offline users must also load their durable progress.
            const scope = scopeNow();
            if (!scope.signedIn) return false;
            const inScope = key => !studyId || !managed(key) || key === `${studyId}_chapter_stats` || key === `${studyId}_chapter_reviews`;
            try {
                const response = await fetch('/api/progress' + (studyId ? `?study_id=${encodeURIComponent(studyId)}` : ''), {credentials: 'same-origin'});
                if (!response.ok) throw new Error('Progress load failed');
                const cloud = await response.json();
                if (cloud._progress_user_id && String(cloud._progress_user_id) !== scope.user || scope.user !== scopeNow().user) throw new Error('Account changed');
                const revisions = cloud._progress_revisions || {};
                const keys = new Set(Object.keys(cloud).filter(key => !key.startsWith('_progress_') && inScope(key)));
                for (const physical of cache.keys()) {
                    const prefix = `progress:user:${scope.user}:`;
                    if (physical.startsWith(prefix) && managed(physical.slice(prefix.length)) && inScope(physical.slice(prefix.length))) keys.add(physical.slice(prefix.length));
                }
                for (const key of keys) {
                    if (tree(key)) continue;
                    if (!managed(key)) { if (cloud[key] !== undefined) writeSmall(key, cloud[key]); continue; }
                    const physical = physicalKey(key, scope);
                    await (writes.get(physical) || Promise.resolve());
                    const current = read(physical), remote = cloud[key] || null;
                    const combined = current.value ? merge(baseValue(current), current.value, remote, key) : remote;
                    const next = {...current, value: combined, revision: revisions[key] || '', base: combined !== remote ? remote : null, pending: Boolean(combined && combined !== remote)};
                    cache.set(physical, next);
                    await persist(physical, latest => {
                        if (latest?.value && latest.value !== current.value) {
                            const value = merge(current.value, combined, latest.value, key);
                            return {...next, value, pending: value !== remote, base: value !== remote ? remote : null};
                        }
                        return next;
                    }, combined, key, scope);
                    if (read(physical).pending) adapter._syncToCloud(key, read(physical).value);
                }
                return true;
            } catch (_) { notify('offline'); return false; }
        },
        _syncToCloud(key, value, urgent = false) {
            const scope = scopeNow();
            if (!scope.signedIn || !csrf()) return;
            const physical = physicalKey(key, scope);
            clearTimeout(timers.get(physical));
            if (urgent) return adapter._flush(key, value, true, scope);
            timers.set(physical, setTimeout(() => adapter._flush(key, value, false, scope), 5000));
        },
        async _flush(key, fallback, urgent = false, scope = scopeNow()) {
            const physical = physicalKey(key, scope);
            if (inflight.has(physical)) return inflight.get(physical);
            const operation = (async () => {
                try {
                    for (let attempt = 0; attempt < 4; attempt++) {
                        if (scope.user !== scopeNow().user || !scope.signedIn) return;
                        await (writes.get(physical) || Promise.resolve());
                        if (managed(key) && !failedKeys.has(physical)) {
                            const generation = generations.get(physical) || 0;
                            const expected = read(physical).value;
                            try {
                                const durable = await database.get(physical);
                                if (durable) adopt(durable, generation, expected, key, scope);
                            } catch (_) { /* Keep the pending in-memory value if storage becomes unavailable. */ }
                        }
                        const current = managed(key) ? read(physical) : null;
                        const value = current ? current.value : fallback;
                        if (typeof value !== 'string') return;
                        const payload = JSON.stringify({key, value, user_id: scope.user, ...(current ? {revision: current.revision} : {})});
                        const response = await fetch('/api/progress/sync', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'x-csrf-token': csrf()}, body: payload, keepalive: urgent && payload.length < 60000});
                        if (scope.user !== scopeNow().user) return;
                        if (current && response.status === 409) {
                            const remote = await response.json();
                            const local = read(physical);
                            const combined = merge(baseValue(current), local.value, remote.value, key);
                            const next = {...local, value: combined, revision: remote.revision, base: remote.value, pending: true};
                            cache.set(physical, next);
                            await persist(physical, latest => ({...next, value: latest?.value && latest.value !== local.value ? merge(local.value, combined, latest.value, key) : combined}), combined, key, scope);
                            merged(key, read(physical).value);
                            continue;
                        }
                        if (!response.ok) {
                            if ([400, 401, 403, 413, 422].includes(response.status)) { notify('sync-error'); return; }
                            throw new Error('Progress save failed');
                        }
                        if (!current) return;
                        const result = await response.json(), local = read(physical);
                        const next = {...local, revision: result.revision, pending: local.value !== value, base: local.value !== value ? value : null};
                        cache.set(physical, next);
                        await persist(physical, latest => {
                            const record = latest || next;
                            if (record.revision !== current.revision && record.revision !== result.revision) return record;
                            return {...record, revision: result.revision, pending: record.value !== value, base: record.value !== value ? value : null};
                        }, local.value, key, scope);
                        if (read(physical).pending) continue;
                        notify('saved');
                        return;
                    }
                    throw new Error('Progress changed repeatedly');
                } catch (_) {
                    notify('offline');
                    timers.set(physical, setTimeout(() => adapter._flush(key, fallback, false, scope), 15000));
                }
            })();
            inflight.set(physical, operation);
            try { await operation; } finally { inflight.delete(physical); }
        },
        async forceSyncAll() {
            const scope = scopeNow();
            if (!scope.signedIn) return;
            const prefix = `progress:user:${scope.user}:`;
            const send = () => {
                for (const [physical, record] of cache) if (physical.startsWith(prefix) && record.pending) adapter._syncToCloud(physical.slice(prefix.length), record.value, true);
            };
            send(); // Start current-page saves immediately on pagehide.
            try {
                for (const record of await database.pending(scope.user)) if (!cache.has(record.key)) cache.set(record.key, record);
                if (scope.user === scopeNow().user) send();
            } catch (_) { /* Current-page progress can still synchronize from memory. */ }
        },
        removeItem(key) {
            if (!managed(key)) { try { storage.removeItem(key); } catch (_) {} transient.delete(key); return; }
            const physical = physicalKey(key, scopeNow());
            cache.delete(physical);
            const operation = (writes.get(physical) || Promise.resolve()).then(() => database.update(physical, () => null)).catch(() => { storageFailed = true; notify('storage-error'); return false; });
            writes.set(physical, operation);
        }
    };
    return adapter;
}

export const StorageAdapter = createStorageAdapter();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') StorageAdapter.forceSyncAll(); });
window.addEventListener('online', () => StorageAdapter.forceSyncAll());
window.addEventListener('pagehide', () => StorageAdapter.forceSyncAll());
