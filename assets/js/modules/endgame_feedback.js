import { assessMove } from './sparring/evaluation.js';

export function endgameMateCue(analysis, player) {
    const score = analysis?.score;
    if (score?.type !== 'mate' || !Number.isInteger(score.value) || score.value === 0) return null;
    return { moves: Math.abs(score.value), winning: (score.value > 0) === (analysis.turn === player) };
}

// Conservative changes in the player's estimated outcome, never exact W/D/L claims.
export function endgameTurningPoint(before, after, player, target = 'w') {
    if (!before?.score || !after?.score || before.depth < 12 || after.depth < 12) return null;
    const value = position => {
        const sign = position.turn === player ? 1 : -1;
        if (position.score.type === 'mate') return position.score.value === 0 ? -100000 * sign : Math.sign(position.score.value) * sign * 100000;
        return position.score.value * sign;
    };
    const first = value(before), last = value(after);
    if (target !== 'd' && first >= 250 && last <= 100) return 'advantage';
    if (first >= -100 && last <= -250 && first - last >= 200) return 'danger';
    return null;
}

export function createEndgameFeedback({ engine, player, target, toggle, evaluationToggle, panel, labels, onUpdate, saved }) {
    const rows = (saved?.rows || []).map(row => ({ ...row, status: row.status === 'done' ? 'done' : 'unanalysed' }));
    const completed = new Map(saved?.analyses || []);
    const cache = new Map();
    for (const [key, value] of completed) cache.set(key, Promise.resolve(value));
    const positionKey = state => state.initialFen + '|' + state.moves.join(' ');
    let queue = Promise.resolve(), disposed = false, reviewing = false, currentState, currentAnalysis = null, positionVersion = 0;
    try { toggle.checked = localStorage.getItem('endgame_live_feedback') === 'true'; } catch (_) { toggle.checked = false; }
    if (evaluationToggle) {
        try { evaluationToggle.checked = localStorage.getItem('endgame_eval_bar') === 'true'; } catch (_) { evaluationToggle.checked = false; }
        evaluationToggle.onchange = () => {
            try { localStorage.setItem('endgame_eval_bar', String(evaluationToggle.checked)); } catch (_) {}
            if (currentState) observe(currentState);
            onUpdate();
        };
    }

    function analysis(state) {
        const key = positionKey(state);
        if (!cache.has(key)) cache.set(key, engine.analyze(state, { movetime: 900, depth: 18 }).then(result => {
            const value = { ...result, turn: state.turn };
            if (!disposed) completed.set(key, value);
            return value;
        }).catch(error => { cache.delete(key); throw error; }));
        return cache.get(key);
    }
    function enqueue(row) {
        if (row.status === 'pending' || row.status === 'done') return;
        row.status = 'pending';
        queue = queue.then(async () => {
            if (disposed) return;
            if (!toggle.checked && !reviewing) { row.status = 'unanalysed'; return; }
            try {
                row.beforeAnalysis = await analysis(row.before);
                if (disposed) return;
                row.afterAnalysis = row.terminal || await analysis(row.after);
                if (disposed) return;
                row.assessment = assessMove(row.beforeAnalysis, row.afterAnalysis, player, row.uci);
                row.moment = row.goalReached ? null : endgameTurningPoint(row.beforeAnalysis, row.afterAnalysis, player, target);
                row.status = 'done';
            } catch (_) { if (!disposed) row.status = 'error'; }
            if (!disposed) onUpdate();
        });
    }
    function observe(state) {
        currentState = state;
        currentAnalysis = completed.get(positionKey(state)) || null;
        const version = ++positionVersion;
        onUpdate();
        if ((!toggle.checked && !evaluationToggle?.checked) || reviewing) return;
        queue = queue.then(async () => {
            if (disposed || version !== positionVersion || (!toggle.checked && !evaluationToggle?.checked) || reviewing) return;
            try {
                const result = await analysis(state);
                if (disposed || version !== positionVersion || (!toggle.checked && !evaluationToggle?.checked) || reviewing) return;
                currentAnalysis = result;
                onUpdate();
            } catch (_) {}
        });
    }
    toggle.onchange = () => {
        try { localStorage.setItem('endgame_live_feedback', String(toggle.checked)); } catch (_) {}
        if (toggle.checked) rows.forEach(enqueue);
        if (currentState) observe(currentState);
        onUpdate();
    };
    return {
        rows,
        snapshot(ply) { return { rows: rows.filter(row => row.ply <= ply).map(row => ({ ...row })), analyses: new Map(completed) }; },
        observe,
        get currentAnalysis() { return currentAnalysis; },
        record(row) { rows.push({ ...row, status: 'unanalysed' }); if (toggle.checked) enqueue(rows[rows.length - 1]); },
        review() { reviewing = true; panel.hidden = false; rows.forEach(enqueue); onUpdate(); },
        close() { reviewing = false; panel.hidden = true; },
        hint(state) {
            const result = queue.then(() => { if (disposed) throw new Error('Cancelled'); return analysis(state); });
            queue = result.catch(() => {});
            return result;
        },
        summary() {
            const done = rows.filter(row => row.status === 'done').length;
            const moments = rows.filter(row => row.moment).length;
            return { done, moments, pending: rows.some(row => row.status === 'pending'), failed: rows.some(row => row.status === 'error') };
        },
        destroy() { disposed = true; toggle.onchange = null; if (evaluationToggle) evaluationToggle.onchange = null; }
    };
}
