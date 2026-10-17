// Large progress documents live here; preferences remain in localStorage.
export function createProgressDatabase(factory) {
    if (factory === undefined) { try { factory = globalThis.indexedDB; } catch (_) { factory = null; } }
    let opening;
    function open() {
        if (opening) return opening;
        opening = new Promise((resolve, reject) => {
            if (!factory) { reject(new Error('IndexedDB unavailable')); return; }
            const request = factory.open('listudy-progress', 1);
            let cancelled = false;
            request.onupgradeneeded = () => {
                for (const name of ['progress', 'archive']) {
                    const store = request.result.objectStoreNames.contains(name)
                        ? request.transaction.objectStore(name) : request.result.createObjectStore(name, {keyPath: 'key'});
                    if (name === 'progress' && !store.indexNames.contains('pending')) store.createIndex('pending', ['account', 'dirty']);
                }
            };
            request.onblocked = () => { cancelled = true; reject(new Error('Progress database upgrade blocked')); };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                if (cancelled) { db.close(); return; }
                db.onversionchange = () => { db.close(); opening = null; };
                db.onclose = () => { opening = null; };
                resolve(db);
            };
        }).catch(error => { opening = null; throw error; });
        return opening;
    }
    async function get(key, name = 'progress') {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(name, 'readonly');
            const request = tx.objectStore(name).get(key);
            tx.oncomplete = () => resolve(request.result || null);
            tx.onabort = () => reject(tx.error || new Error('Progress read aborted'));
            tx.onerror = () => {};
        });
    }
    async function list(prefix = '', keysOnly = false) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('progress', 'readonly');
            const store = tx.objectStore('progress');
            const range = prefix ? IDBKeyRange.bound(prefix, prefix + '\uffff') : null;
            const request = keysOnly ? store.getAllKeys(range) : store.getAll(range);
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error || new Error('Progress listing aborted'));
            tx.onerror = () => {};
        });
    }
    async function update(key, transform) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('progress', 'readwrite');
            const store = tx.objectStore('progress');
            const request = store.get(key);
            let result, failure;
            request.onsuccess = () => {
                try {
                    result = transform(request.result || null);
                    if (result) {
                        result = {...result, key, account: key.match(/^progress:user:([^:]+):/)?.[1] || 'guest', dirty: result.pending ? 1 : 0};
                        const previous = request.result;
                        if (!previous || ['value', 'revision', 'base', 'pending', 'account', 'dirty'].some(field => previous[field] !== result[field])) store.put(result);
                    } else store.delete(key);
                } catch (error) { failure = error; tx.abort(); }
            };
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(failure || tx.error || new Error('Progress write aborted'));
            tx.onerror = () => {};
        });
    }
    async function archive(key, value) {
        const db = await open();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('archive', 'readwrite');
            tx.objectStore('archive').put({key, value});
            tx.oncomplete = resolve;
            tx.onabort = () => reject(tx.error || new Error('Progress archive aborted'));
            tx.onerror = () => {};
        });
        const copy = await get(key, 'archive');
        if (copy?.value !== value) throw new Error('Progress archive verification failed');
    }
    async function pending(account) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('progress', 'readonly');
            const request = tx.objectStore('progress').index('pending').getAll(IDBKeyRange.only([account, 1]));
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error || new Error('Pending progress read aborted'));
            tx.onerror = () => {};
        });
    }
    return {get, list, update, archive, pending};
}
