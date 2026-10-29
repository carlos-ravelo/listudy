const MAXIMUM_DEPTH = -1;

export function createPracticeDepth({ storage, studyId, chapterDepths = () => [] }) {
    let key, selectedChapter, enabled = false, depth = 1, available = 1;
    const clamp = value => Math.max(1, Math.min(available, value));
    const storedDepth = () => depth === available ? MAXIMUM_DEPTH : depth;
    return {
        selectChapter(chapter, maximum) {
            selectedChapter = chapter;
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
            if (command?.type === 'stepAll' || command?.type === 'applyAll') {
                if (command.type === 'stepAll' && ![1, -1].includes(command.value)) return false;
                let changed = false;
                chapterDepths().forEach((maximum, chapter) => {
                    const target = createPracticeDepth({ storage, studyId });
                    target.selectChapter(chapter, maximum);
                    if (command.type === 'stepAll') {
                        if (Number.isFinite(target.limit)) changed = target.change({ type: 'step', value: command.value }) || changed;
                    } else {
                        // Copy the numeric depth even when this chapter is at its maximum.
                        const snapshot = target.snapshot();
                        const next = Math.max(1, Math.min(snapshot.available, depth));
                        const targetKey = `max_depth_${studyId}_${chapter}`;
                        if (snapshot.depth !== next) {
                            storage.setItem(targetKey, next === snapshot.available ? MAXIMUM_DEPTH : next);
                            changed = true;
                        }
                        if (snapshot.enabled !== enabled) {
                            storage.setItem(targetKey + '_enabled', String(enabled));
                            changed = true;
                        }
                    }
                });
                this.selectChapter(selectedChapter, available);
                return changed;
            }
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
