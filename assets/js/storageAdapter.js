import { mergeProgress } from './modules/study/progress_merge.js';
const timers = {};
const inflight = {};
const writerSnapshots = {};
const managed = key => /_chapter_(stats|reviews)$/.test(key);
const owner = () => document.getElementById('collection_modal')?.dataset.userId || '';
const signedIn = () => typeof logged_in !== 'undefined' && logged_in && owner();
const storageKey = key => managed(key) && signedIn() ? `progress:user:${owner()}:${key}` : key;
const metadataKey = key => storageKey(key) + ':sync';
const status = state => window.dispatchEvent(new CustomEvent('study-sync-status', { detail: { state } }));
const metadata = key => {
    try { return JSON.parse(localStorage.getItem(metadataKey(key))) || { revision: '', value: null, pending: false }; }
    catch (_) { return { revision: '', value: null, pending: false }; }
};
const merge = (base, local, remote, key) => JSON.stringify(mergeProgress(base, local, remote, key));
const csrf = () => document.querySelector("meta[name='csrf-token']")?.getAttribute('content') || document.querySelector("input[name='_csrf_token']")?.value;
const emitMerged = (key, value) => window.dispatchEvent(new CustomEvent('study-progress-sync-merged', { detail: { key, value } }));

export const StorageAdapter = {
    getItem(key) {
        const value = localStorage.getItem(storageKey(key));
        if (managed(key)) writerSnapshots[key] = value;
        return value;
    },
    setItem(key, value) {
        value = String(value);
        if (managed(key)) {
            const current = localStorage.getItem(storageKey(key));
            if (current && current !== writerSnapshots[key]) value = merge(writerSnapshots[key], value, current, key);
            writerSnapshots[key] = String(arguments[1]);
            const meta = metadata(key);
            localStorage.setItem(metadataKey(key), JSON.stringify({ ...meta, pending: true }));
        }
        localStorage.setItem(storageKey(key), value);
        if (!key.endsWith('_tree')) this._syncToCloud(key, value);
    },
    backup(key) {
        const value = localStorage.getItem(storageKey(key));
        if (value) localStorage.setItem(storageKey(key) + ':backup', value);
    },
    async hydrate() {
        if (!signedIn()) return false;
        try {
            const response = await fetch('/api/progress', { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Progress load failed');
            const cloud = await response.json();
            const revisions = cloud._progress_revisions || {};
            const keys = new Set(Object.keys(cloud).filter(key => !key.startsWith('_progress_')));
            for (let index = 0; index < localStorage.length; index++) {
                const stored = localStorage.key(index);
                const prefix = `progress:user:${owner()}:`;
                if (stored.startsWith(prefix) && managed(stored.slice(prefix.length))) keys.add(stored.slice(prefix.length));
            }
            for (const key of keys) {
                if (key.endsWith('_tree')) continue;
                if (!managed(key)) { if (cloud[key] !== undefined) localStorage.setItem(key, cloud[key]); continue; }
                const local = localStorage.getItem(storageKey(key));
                const meta = metadata(key);
                const remote = cloud[key] || null;
                // Unowned legacy storage is kept as a backup, never imported into another account.
                const legacy = localStorage.getItem(key);
                if (!local && legacy) localStorage.setItem(storageKey(key) + ':legacy-backup', legacy);
                const combined = local ? merge(meta.value, local, remote, key) : remote;
                if (combined) localStorage.setItem(storageKey(key), combined);
                const pending = Boolean(combined && combined !== remote);
                localStorage.setItem(metadataKey(key), JSON.stringify({ revision: revisions[key] || '', value: remote, pending }));
                if (pending) this._syncToCloud(key, combined);
            }
            return true;
        } catch (_) { status('offline'); return false; }
    },
    _syncToCloud(key, value, urgent = false) {
        if (!signedIn() || !csrf()) return;
        clearTimeout(timers[key]);
        if (urgent) return this._flush(key, value, true);
        timers[key] = setTimeout(() => this._flush(key, value), 5000);
    },
    async _flush(key, fallback, urgent = false) {
        if (inflight[key]) return inflight[key];
        const operation = async () => {
            try {
                for (let attempt = 0; attempt < 4; attempt++) {
                    const value = managed(key) ? localStorage.getItem(storageKey(key)) : fallback;
                    const meta = metadata(key);
                    const payload = JSON.stringify({ key, value, ...(managed(key) ? { revision: meta.revision } : {}) });
                    const response = await fetch('/api/progress/sync', {
                        method: 'POST', credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf() },
                        body: payload, keepalive: urgent && payload.length < 60000
                    });
                    if (managed(key) && response.status === 409) {
                        const remote = await response.json();
                        this.backup(key);
                        const combined = merge(meta.value, localStorage.getItem(storageKey(key)), remote.value, key);
                        localStorage.setItem(storageKey(key), combined);
                        localStorage.setItem(metadataKey(key), JSON.stringify({ revision: remote.revision, value: remote.value, pending: true }));
                        emitMerged(key, combined);
                        continue;
                    }
                    if (!response.ok) throw new Error('Progress save failed');
                    if (!managed(key)) return;
                    const result = await response.json();
                    const current = localStorage.getItem(storageKey(key));
                    const pending = current !== value;
                    localStorage.setItem(metadataKey(key), JSON.stringify({ revision: result.revision, value, pending }));
                    if (pending) continue;
                    status('saved');
                    return;
                }
                throw new Error('Progress changed repeatedly');
            } catch (_) {
                status('offline');
                timers[key] = setTimeout(() => this._flush(key, fallback), 15000);
            }
        };
        inflight[key] = operation();
        try { await inflight[key]; } finally { delete inflight[key]; }
    },
    forceSyncAll() {
        if (!signedIn()) return;
        const prefix = `progress:user:${owner()}:`;
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (!key.startsWith(prefix) || !key.endsWith(':sync')) continue;
            const original = key.slice(prefix.length, -5);
            if (metadata(original).pending) this._syncToCloud(original, localStorage.getItem(storageKey(original)), true);
        }
    },
    removeItem(key) { localStorage.removeItem(storageKey(key)); }
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') StorageAdapter.forceSyncAll(); });
window.addEventListener('online', () => StorageAdapter.forceSyncAll());
window.addEventListener('pagehide', () => StorageAdapter.forceSyncAll());
