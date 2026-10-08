import { CollectionStore } from './collection_store.js';

export class CollectionAccount {
    constructor(store, userId, report) {
        this.store = store;
        this.userId = userId;
        this.hasScoped = localStorage.getItem(store.key) !== null;
        this.report = report;
        this.revisionKey = store.key + ':revision';
        this.dirtyKey = store.key + ':pending';
        this.revision = localStorage.getItem(this.revisionKey) || '';
        this.dirty = localStorage.getItem(this.dirtyKey) === 'true';
        this.ready = false;
        this.blocked = false;
        store.onSave = () => {
            this.dirty = true;
            localStorage.setItem(this.dirtyKey, 'true');
            this.report(this.blocked ? 'Saved on this device · collections changed elsewhere. Reload saved collections to continue.' :
                this.ready ? 'Saved on this device · saving to account…' : 'Saved on this device · use Retry save to connect to your account.');
            clearTimeout(this.timer);
            if (this.ready && !this.blocked) this.timer = setTimeout(() => this.flush().catch(() => {}), 300);
        };
    }

    async request(method = 'GET', body) {
        const token = document.querySelector('meta[name="csrf-token"]')?.content;
        const response = await fetch('/api/collections', {
            method, credentials: 'same-origin',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-csrf-token': token || '' },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        const result = await response.json();
        if (!response.ok) {
            if (response.status === 409) this.blocked = true;
            throw new Error(result.error || 'Could not save collections to your account. Your local copy is kept.');
        }
        return result;
    }

    accept(result) {
        localStorage.setItem(this.store.key, JSON.stringify(result.data));
        this.revision = result.revision;
        localStorage.setItem(this.revisionKey, this.revision);
        localStorage.removeItem(this.dirtyKey);
        this.dirty = false;
    }

    async initialize() {
        try {
            const remote = await this.request();
            const scoped = this.hasScoped;
            const owner = localStorage.getItem('listudy_collections_owner');
            const legacy = !scoped && (!owner || owner === this.userId) &&
                (localStorage.getItem('listudy_collections') || localStorage.getItem('listudy_cart'));
            if (this.dirty) {
                if (this.revision !== remote.revision) {
                    this.blocked = true;
                    throw new Error('Collections changed elsewhere. Your local copy is kept. Reload saved collections to continue.');
                }
            } else if (legacy) {
                const local = new CollectionStore(localStorage).read();
                const merged = { active: remote.data.active, collections: Object.assign(Object.create(null), remote.data.collections) };
                for (const [name, items] of Object.entries(local.collections || {})) {
                    if (!Object.hasOwn(merged.collections, name)) merged.collections[name] = [];
                    for (const item of items) if (!merged.collections[name].some(saved => saved.pgn === item.pgn)) merged.collections[name].push(item);
                }
                this.revision = remote.revision;
                this.store.save(merged);
                localStorage.setItem('listudy_collections_owner', this.userId);
            } else this.accept(remote);
            this.ready = true;
            if (this.dirty) await this.flush();
            else this.report('Saved to your account');
        } catch (error) {
            this.report(error.message);
            throw error;
        }
    }

    async flush() {
        clearTimeout(this.timer);
        if (!this.ready || this.blocked) throw new Error('Reload saved collections before saving to your account. Your local copy is kept.');
        if (this.saving) await this.saving;
        if (!this.dirty) return;
        const snapshot = JSON.stringify(this.store.read());
        this.saving = this.request('PUT', { revision: this.revision, data: JSON.parse(snapshot) });
        try {
            const result = await this.saving;
            this.revision = result.revision;
            localStorage.setItem(this.revisionKey, this.revision);
            if (JSON.stringify(this.store.read()) === snapshot) {
                this.dirty = false;
                localStorage.removeItem(this.dirtyKey);
                this.report('Saved to your account');
            }
        } catch (error) {
            this.report(error.message);
            throw error;
        } finally { this.saving = null; }
        if (this.dirty) await this.flush();
    }

    async reload() {
        clearTimeout(this.timer);
        if (this.saving) await this.saving;
        this.accept(await this.request());
        this.blocked = false;
        this.ready = true;
        this.report('Saved to your account');
    }
}
