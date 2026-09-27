const STORAGE_KEY = 'listudy_collections';
const LEGACY_KEY = 'listudy_cart';
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function migrateItem(item) {
    if (typeof item !== 'string') return item;
    const title = item.match(/\[Event\s+"([^"]+)"\]/i) || item.match(/\[White\s+"([^"]+)"\]/i);
    // Old entries did not record their source study. Do not invent a link.
    return { pgn: item, study: 'Unknown Study', title: title ? title[1] : 'Unnamed Chapter' };
}

export class CollectionStore {
    constructor(storage) {
        this.storage = storage;
    }

    read() {
        const raw = this.storage.getItem(STORAGE_KEY);
        const legacy = this.storage.getItem(LEGACY_KEY);
        let data;
        try {
            data = raw ? JSON.parse(raw) : { active: 'Default', collections: { Default: JSON.parse(legacy || '[]') } };
            if (!data || !data.collections || typeof data.collections !== 'object' || Array.isArray(data.collections)) throw new Error();
            const collections = Object.create(null);
            for (const [name, items] of Object.entries(data.collections)) {
                if (!Array.isArray(items)) throw new Error();
                collections[name] = items.map(migrateItem);
                if (collections[name].some(item => !item || typeof item.pgn !== 'string')) throw new Error();
            }
            if (!Object.keys(collections).length) collections.Default = [];
            data = { active: owns(collections, data.active) ? data.active : Object.keys(collections)[0], collections };
        } catch (_) {
            throw new Error('The saved collections could not be read. Your saved data has been kept.');
        }
        if (JSON.stringify(data) !== raw) this.save(data);
        // Only remove legacy data after the replacement has been saved.
        if (!raw && legacy) this.storage.removeItem(LEGACY_KEY);
        return data;
    }

    save(data) {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    change(operation) {
        const data = this.read();
        operation(data, data.collections[data.active]);
        this.save(data);
        return data;
    }

    select(name) {
        return this.change(data => { if (owns(data.collections, name)) data.active = name; });
    }

    create(name) {
        return this.change(data => {
            if (!owns(data.collections, name)) data.collections[name] = [];
            data.active = name;
        });
    }

    rename(name) {
        return this.change(data => {
            if (name === data.active) return;
            if (owns(data.collections, name)) throw new Error('A collection with this name already exists.');
            data.collections[name] = data.collections[data.active];
            delete data.collections[data.active];
            data.active = name;
        });
    }

    delete() {
        return this.change(data => {
            if (Object.keys(data.collections).length === 1) throw new Error('Clear your only collection instead of deleting it.');
            delete data.collections[data.active];
            data.active = Object.keys(data.collections)[0];
        });
    }

    clear() { return this.change((data) => { data.collections[data.active] = []; }); }
    add(item) { return this.change((_, items) => { if (!items.some(saved => saved.pgn === item.pgn)) items.push(item); }); }
    remove(index) { return this.change((_, items) => { items.splice(index, 1); }); }
    reorder(index, offset) {
        return this.change((_, items) => {
            const target = index + offset;
            if (target >= 0 && target < items.length) [items[index], items[target]] = [items[target], items[index]];
        });
    }
    move(index, name) {
        return this.change((data, items) => {
            if (name !== data.active && owns(data.collections, name) && items[index]) data.collections[name].push(items.splice(index, 1)[0]);
        });
    }
}
