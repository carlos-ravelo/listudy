const MAXIMUM_DEPTH = -1;

export function createPracticeDepth({ storage, studyId }) {
    let key, enabled = false, depth = 1, available = 1;
    const clamp = value => Math.max(1, Math.min(available, value));
    const storedDepth = () => depth === available ? MAXIMUM_DEPTH : depth;
    return {
        selectChapter(chapter, maximum) {
            key = `max_depth_${studyId}_${chapter}`;
            available = Math.max(1, maximum);
            enabled = storage.getItem(key + '_enabled') === 'true';
            const saved = parseInt(storage.getItem(key), 10);
            depth = clamp(!Number.isInteger(saved) || saved === MAXIMUM_DEPTH ? available : saved);
        },
        get limit() { return enabled && depth < available ? depth : Infinity; },
        snapshot() { return { enabled, depth, available }; },
        change(command) {
            if (!key) return false;
            if (command?.type === 'enable' && typeof command.value === 'boolean') {
                if (enabled === command.value) return false;
                enabled = command.value;
                storage.setItem(key + '_enabled', String(enabled));
                return true;
            }
            if (!enabled) return false;
            let next;
            if (command?.type === 'step' && [1, -1].includes(command.value)) next = depth + command.value;
            else if (command?.type === 'depth') next = Number(command.value);
            if (!Number.isInteger(next)) return false;
            next = clamp(next);
            if (next === depth) return false;
            depth = next;
            storage.setItem(key, storedDepth());
            return true;
        }
    };
}
