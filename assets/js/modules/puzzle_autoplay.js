import { createPageScope } from './page_scope.js';

export function createPuzzleAutoplay({isFinished, next, delay = 1200}) {
    const scope = createPageScope();
    let controls = createPageScope(), boundControl;
    scope.use(() => controls.destroy());
    let enabled = false, timer, waiting = false;
    try { enabled = localStorage.getItem('puzzle_autoplay') === 'true'; } catch (_) {}
    const control = () => document.getElementById('puzzle_autoplay');
    function clear() { scope.clearTimeout(timer); timer = undefined; }
    function cancel() { clear(); waiting = true; }
    function reset() { clear(); waiting = false; }
    function completed() {
        if (!scope.active || waiting || timer !== undefined || !control() || !enabled || !isFinished() || document.hidden) return;
        timer = scope.timeout(() => {
            timer = undefined;
            if (control() && enabled && isFinished() && !document.hidden) { waiting = true; next(); }
        }, delay);
    }
    function refresh() {
        if (!scope.active) return;
        const input = control();
        if (input !== boundControl) {
            controls.destroy(); controls = createPageScope(); boundControl = input;
            if (input) controls.assign(input, 'onchange', () => {
                enabled = input.checked;
                try { localStorage.setItem('puzzle_autoplay', String(enabled)); } catch (_) {}
                clear(); completed();
            });
        }
        if (!input) { clear(); return; }
        input.checked = enabled;
        completed();
    }
    scope.listen(document, 'visibilitychange', () => document.hidden ? clear() : completed());
    scope.listen(window, 'pagehide', cancel);
    return {refresh, completed, cancel, reset, destroy() { cancel(); scope.destroy(); }};
}
