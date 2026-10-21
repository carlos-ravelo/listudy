export function setupPracticeActivity({ tracker, eligible, intervalMs = 15000,
    persistOnBlocking = true, resumeOnVisible = false, onHidden = () => {},
    onInterval = () => tracker.persist(), onPageHide = () => {} }) {
    const listeners = [];
    function listen(target, event, handler, capture = false) {
        target.addEventListener(event, handler, capture);
        listeners.push(() => target.removeEventListener(event, handler, capture));
    }
    const tick = () => tracker.tick(Date.now(), eligible());
    const activity = () => tracker.activity(Date.now(), eligible());
    listen(document, 'pointerdown', activity, true);
    listen(document, 'keydown', activity, true);
    listen(document, 'ui-blocking-changed', () => {
        tick();
        if (persistOnBlocking) tracker.persist();
    });
    listen(document, 'visibilitychange', () => {
        if (!document.hidden && resumeOnVisible) activity();
        else {
            tick();
            tracker.persist();
            if (document.hidden) onHidden();
        }
    });
    listen(window, 'blur', () => { tracker.tick(Date.now(), false); tracker.persist(); });
    listen(window, 'focus', activity);
    listen(window, 'pagehide', onPageHide);
    const timer = setInterval(() => { tick(); onInterval(); }, intervalMs);
    return () => {
        clearInterval(timer);
        listeners.splice(0).forEach(remove => remove());
    };
}
