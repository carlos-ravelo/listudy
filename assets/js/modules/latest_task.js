export function createLatestTask({ onCancel = () => {} } = {}) {
    let current = null, destroyed = false;
    function cancel() {
        const task = current;
        current = null;
        if (task) {
            task.controller.abort();
            onCancel();
        }
    }
    return {
        start() {
            cancel();
            if (destroyed) return null;
            const task = { controller: new AbortController() };
            current = task;
            return {
                signal: task.controller.signal,
                isCurrent: () => !destroyed && current === task,
                finish() { if (current === task) current = null; }
            };
        },
        cancel,
        destroy() { destroyed = true; cancel(); }
    };
}
