import { createPageScope } from '../page_scope.js';
const lengths = [1, 2, 4];

export function visualizationLevel(runs = {}, steps = lengths) {
    let level = 0, streak = 0;
    for (const run of Object.values(runs).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))) {
        if (run.errors || run.assisted) { level = Math.max(0, level - 1); streak = 0; }
        else if (run.completed && run.moves >= run.target && run.target === steps[level]) {
            if (++streak === 3) { level = Math.min(steps.length - 1, level + 1); streak = 0; }
        }
    }
    return steps[level];
}

export function setupStudyVisualization({ storage, getStats, persist, assist, refresh }) {
    const scope = createPageScope();
    const panel = document.getElementById('study_visualization');
    if (!panel) return null;
    const enabled = panel.querySelector('input');
    const difficulty = panel.querySelector('select');
    const action = panel.querySelector('button');
    const status = panel.querySelector('[role="status"]');
    const history = panel.querySelector('[data-visualization-history]');
    const frame = document.querySelector('.study-board-frame');
    let presentingFailure = false;
    let reading = false, blocked = false, complete = false, run = null, opponent = '', previousActive = null;
    enabled.checked = storage.getItem('tactics_visualization') === 'true';
    const saved = storage.getItem('tactics_visualization_length');
    difficulty.value = ['auto', '1', '2', '4'].includes(saved) ? saved : 'auto';
    const active = () => enabled.checked && !reading && !blocked;
    function save(completed) {
        if (!run) return;
        const stats = getStats();
        stats.visualizationRuns ||= {};
        stats.visualizationRuns[run.id] = { ...run, completed, at: Date.now() };
        run = null;
        persist();
    }
    function render() {
        const hidden = active() && !!run && !presentingFailure;
        frame.classList.toggle('study-visualization-hidden', hidden);
        panel.hidden = reading || blocked || presentingFailure;
        difficulty.hidden = !active();
        action.hidden = !active();
        action.disabled = complete;
        action.textContent = hidden ? panel.dataset.reveal : panel.dataset.hide;
        action.setAttribute('aria-pressed', String(hidden));
        status.hidden = !active();
        const target = difficulty.value === 'auto' ? visualizationLevel(getStats().visualizationRuns) : Number(difficulty.value);
        const instruction = hidden ? panel.dataset.hidden.replace('%count%', `${run.moves}/${run.target}`)
            : complete ? panel.dataset.complete : panel.dataset.memorize.replace('%count%', target);
        status.textContent = instruction + (opponent ? ` · ${panel.dataset.reply} ${opponent}` : '');
        const runs = Object.values(getStats().visualizationRuns || {});
        history.hidden = !active() || !runs.length;
        history.textContent = panel.dataset.history.replace('%clean%', runs.filter(item => item.completed && !item.assisted && !item.errors).length)
            .replace('%total%', runs.length);
        if (hidden) {
            window.ground.set({ movable: { showDests: false }, highlight: { lastMove: false, check: false },
                draggable: { enabled: false }, animation: { enabled: false } });
            window.ground.setShapes([]);
            window.ground.setAutoShapes([]);
        } else {
            window.ground.set({ movable: { showDests: true }, highlight: { lastMove: true, check: true }, draggable: { enabled: true } });
        }
        if (active() && complete) window.ground.set({ movable: { dests: new Map() } });
        if (previousActive !== active()) {
            previousActive = active();
            window.dispatchEvent(new CustomEvent('study-visualization-updated', { detail: { active: previousActive } }));
        }
    }
    function reveal() {
        if (run) { run.assisted = true; assist(); save(false); }
        render();
    }
    scope.assign(enabled, 'onchange', () => {
        reveal();
        storage.setItem('tactics_visualization', String(enabled.checked));
        if (enabled.checked) document.getElementById('practice_lines').click();
        refresh();
    });
    scope.assign(difficulty, 'onchange', () => { reveal(); storage.setItem('tactics_visualization_length', difficulty.value); render(); });
    scope.assign(action, 'onclick', () => {
        if (run) { reveal(); refresh(); return; }
        if (!active() || complete) return;
        run = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, at: Date.now(),
            target: difficulty.value === 'auto' ? visualizationLevel(getStats().visualizationRuns) : Number(difficulty.value),
            moves: 0, errors: 0, assisted: false };
        opponent = '';
        refresh();
        render();
    });
    scope.listen(window, 'study-reading-updated', event => {
        if (reading !== event.detail.reading) { reveal(); reading = event.detail.reading; render(); }
    });
    scope.listen(window, 'pagehide', () => save(false));
    return {
        destroy() { save(false); scope.destroy(); },
        get active() { return active(); },
        get hidden() { return active() && !!run && !presentingFailure; },
        render,
        reveal,
        previewFailure() { presentingFailure = true; render(); },
        finishFailure() { save(false); render(); },
        endFailure() { presentingFailure = false; render(); },
        reset() { presentingFailure = false; save(false); complete = false; opponent = ''; render(); },
        block(value) { if (value) reveal(); blocked = value; render(); },
        decision(correct, assisted) {
            if (!run) return;
            if (!correct) run.errors += 1;
            if (assisted) run.assisted = true;
            if (correct) run.moves += 1;
        },
        reply(san) { if (active()) { opponent = san || ''; render(); } },
        settle(end) {
            if (run && (end || run.moves >= run.target)) save(true);
            if (active() && end) complete = true;
            render();
        }
    };
}
