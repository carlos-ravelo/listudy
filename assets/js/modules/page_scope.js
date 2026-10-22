export function createPageScope({ timers = globalThis, onError = error => console.error('Page cleanup failed:', error) } = {}) {
    let active = true;
    const cleanups = [], timeouts = new Set(), frames = new Set(), sleeps = new Map();
    function use(resource) {
        const cleanup = typeof resource === 'function' ? resource : resource?.destroy?.bind(resource);
        if (cleanup) {
            if (active) cleanups.push(cleanup);
            else cleanup();
        }
        return resource;
    }
    const scope = {
        get active() { return active; },
        use,
        guard(callback) { return function(...args) { if (active) return callback.apply(this, args); }; },
        listen(target, event, callback, options) {
            if (!active) return;
            const handler = scope.guard(callback);
            target.addEventListener(event, handler, options);
            use(() => target.removeEventListener?.(event, handler, options));
        },
        assign(target, property, callback) {
            if (!active) return;
            const previous = target[property];
            const handler = scope.guard(callback);
            target[property] = handler;
            use(() => { if (target[property] === handler) target[property] = previous; });
        },
        timeout(callback, delay) {
            if (!active) return;
            const id = timers.setTimeout(() => { timeouts.delete(id); if (active) callback(); }, delay);
            timeouts.add(id);
            return id;
        },
        sleep(delay) {
            if (!active) return Promise.resolve(false);
            return new Promise(resolve => {
                const id = scope.timeout(() => { sleeps.delete(id); resolve(true); }, delay);
                sleeps.set(id, resolve);
            });
        },
        clearTimeout(id) { timers.clearTimeout(id); timeouts.delete(id); },
        cancelFrame(id) { if (id != null) timers.cancelAnimationFrame(id); frames.delete(id); },
        frame(callback) {
            if (!active) return;
            const id = timers.requestAnimationFrame(() => { frames.delete(id); if (active) callback(); });
            frames.add(id);
            return id;
        },
        destroy() {
            if (!active) return;
            active = false;
            timeouts.forEach(id => timers.clearTimeout(id)); timeouts.clear();
            frames.forEach(id => timers.cancelAnimationFrame(id)); frames.clear();
            sleeps.forEach(resolve => resolve(false)); sleeps.clear();
            for (const cleanup of cleanups.splice(0).reverse()) {
                try { cleanup(); } catch (error) { onError(error); }
            }
        }
    };
    return scope;
}
