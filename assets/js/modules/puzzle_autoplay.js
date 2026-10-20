export function createPuzzleAutoplay({isFinished, next, delay = 1200}) {
    let enabled = false, timer, waiting = false;
    try { enabled = localStorage.getItem('puzzle_autoplay') === 'true'; } catch (_) {}
    const control = () => document.getElementById('puzzle_autoplay');
    function clear() { clearTimeout(timer); timer = undefined; }
    function cancel() { clear(); waiting = true; }
    function reset() { clear(); waiting = false; }
    function completed() {
        if (waiting || timer !== undefined || !control() || !enabled || !isFinished() || document.hidden) return;
        timer = setTimeout(() => {
            timer = undefined;
            if (control() && enabled && isFinished() && !document.hidden) { waiting = true; next(); }
        }, delay);
    }
    function refresh() {
        const input = control();
        if (!input) { clear(); return; }
        input.checked = enabled;
        input.onchange = () => {
            enabled = input.checked;
            try { localStorage.setItem('puzzle_autoplay', String(enabled)); } catch (_) {}
            clear();
            completed();
        };
        completed();
    }
    document.addEventListener('visibilitychange', () => document.hidden ? clear() : completed());
    window.addEventListener('pagehide', cancel);
    return {refresh, completed, cancel, reset};
}
