import { createPageScope } from './page_scope.js';
import { createAttemptState } from './attempt_state.js';
import { visualizationLevel } from './study/visualization.js';

export function createNativeVisualization({ mode, storage, now = Date.now, changed = () => {} }) {
    const key = `native_visualization_v1:${mode}`;
    let data;
    try { data = JSON.parse(storage.getItem(key)); } catch (_) {}
    if (!data || data.version !== 1 || !data.runs || typeof data.runs !== 'object') data = { version: 1, runs: {}, settings: {} };
    data.settings ||= {};
    let current = null, attempt = null;
    const steps = mode === 'blind' ? [1, 2, 4, 8, 16, 20] : [1, 2, 4, 8, 16, 32];
    function persist() {
        try { storage.setItem(key, JSON.stringify(data)); } catch (_) {}
        changed(data, current);
    }
    return {
        get data() { return data; },
        get current() { return current; },
        get level() { return visualizationLevel(data.runs, steps); },
        setting(name, fallback) { return data.settings[name] ?? fallback; },
        configure(name, value) { data.settings[name] = value; persist(); },
        begin(exercise, target, available) {
            if (attempt?.active) attempt.finish({ abandoned: true, endedAt: now() });
            const rehearsed = Object.values(data.runs).some(run => run.exercise === exercise &&
                (run.attempts || run.revealed || run.assisted) && now() - run.at < 30 * 60 * 1000);
            const id = `${now()}-${Math.random().toString(36).slice(2)}`;
            current = { id, exercise, at: now(), target, available, moves: 0, attempts: 0, errors: 0,
                hiddenMoves: mode === 'blind' ? available : 0, hiddenPieces: mode === 'pieceless' ? available : 0,
                assisted: rehearsed, rehearsed, completed: false, revealed: false };
            attempt = createAttemptState(current);
            data.runs[id] = current;
            persist();
        },
        decision(correct) {
            if (attempt?.decision(correct)) persist();
        },
        help() { if (attempt?.assist()) persist(); },
        end(completed, revealed = false) {
            if (!attempt?.active) return;
            // The challenge is the amount held in memory, not the solution length.
            attempt.finish({ completed, revealed, assisted: current.assisted || revealed,
                moves: completed ? current.available : 0, endedAt: now() });
            persist();
        },
        abandon() {
            if (attempt?.active) { attempt.finish({ abandoned: true, endedAt: now() }); persist(); }
        }
    };
}

export function setupNativeVisualization(mode) {
    const scope = createPageScope();
    const panel = document.querySelector('[data-native-visualization]');
    const summary = panel.querySelector('[data-visualization-summary]');
    const result = panel.querySelector('[data-visualization-result]');
    const amount = panel.querySelector('[data-visualization-amount]');
    const destinations = panel.querySelector('[data-visualization-destinations]');
    const difficulty = panel.querySelector('[data-visualization-difficulty]');
    let storage;
    try { storage = window.localStorage; } catch (_) { storage = {getItem() {}, setItem() {}}; }
    const tracker = createNativeVisualization({ mode, storage, changed(data, current) {
        const runs = Object.values(data.runs);
        const clean = runs.filter(run => run.completed && !run.errors && !run.assisted).length;
        summary.textContent = panel.dataset.summary.replace('%clean%', clean).replace('%total%', runs.length);
        if (!current) return;
        amount.textContent = panel.dataset.amount.replace('%count%', current.available);
        const state = current.revealed ? 'revealed' : current.completed
            ? current.assisted ? 'assisted' : current.errors ? 'retried' : 'clean' : 'playing';
        result.textContent = panel.dataset[state];
        result.dataset.result = state;
        result.title = panel.dataset.errors.replace('%count%', current.errors);
    }});
    destinations.checked = tracker.setting('destinations', false);
    difficulty.value = tracker.setting('difficulty', mode === 'blind' && storage.getItem('blind_tactics_hidden') !== null ? 'manual' : 'auto');
    scope.assign(difficulty, 'onchange', () => tracker.configure('difficulty', difficulty.value));
    scope.assign(destinations, 'onchange', () => {
        tracker.configure('destinations', destinations.checked);
        if (destinations.checked) tracker.help();
        window.dispatchEvent(new CustomEvent('native-visualization-destinations', {detail: {enabled: destinations.checked}}));
    });
    scope.listen(window, 'pagehide', () => tracker.abandon());
    return { tracker, difficulty, destinations,
        get target() { return difficulty.value === 'auto' ? tracker.level : difficulty.value === 'all' ? 32 : Number(difficulty.value) || null; },
        help() { tracker.help(); },
        begin(exercise, requested, available) { tracker.begin(exercise, requested, available); },
        destroy() { tracker.abandon(); scope.destroy(); }
    };
}

export function createPieceMask(board, squares) {
    let hidden = new Set(squares);
    function render() {
        for (const piece of board.querySelectorAll('piece')) piece.classList.toggle('visualization-hidden-piece', hidden.has(piece.cgKey));
    }
    const observer = new MutationObserver(render);
    observer.observe(board, {childList: true, subtree: true, attributes: true, attributeFilter: ['style']});
    render();
    return {
        move(move) {
            const wasHidden = hidden.delete(move.from);
            hidden.delete(move.to);
            if (wasHidden) hidden.add(move.to);
            if (move.flags.includes('e')) hidden.delete(move.to[0] + move.from[1]);
            if (move.flags.includes('k') || move.flags.includes('q')) {
                const rank = move.from[1], rookFrom = (move.flags.includes('k') ? 'h' : 'a') + rank;
                if (hidden.delete(rookFrom)) hidden.add((move.flags.includes('k') ? 'f' : 'd') + rank);
            }
            render();
        },
        destroy() { observer.disconnect(); }
    };
}
