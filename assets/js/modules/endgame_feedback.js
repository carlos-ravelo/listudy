import { assessMove } from './sparring/evaluation.js';

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

export function createEndgameFeedback({ engine, player, target, toggle, panel, labels, onUpdate, onNotice }) {
    const rows = [];
    const cache = new Map();
    let queue = Promise.resolve(), disposed = false, reviewing = false;
    try { toggle.checked = localStorage.getItem('endgame_live_feedback') === 'true'; } catch (_) { toggle.checked = false; }

    function analysis(state) {
        const key = state.initialFen + '|' + state.moves.join(' ');
        if (!cache.has(key)) cache.set(key, engine.analyze(state, { movetime: 900, depth: 18 }).then(result => ({ ...result, turn: state.turn })).catch(error => { cache.delete(key); throw error; }));
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
                if (toggle.checked && !reviewing && row === rows[rows.length - 1] && row.moment) onNotice(row.san + ' · ' + labels[row.moment]);
            } catch (_) { if (!disposed) row.status = 'error'; }
            if (!disposed) onUpdate();
        });
    }
    toggle.onchange = () => {
        try { localStorage.setItem('endgame_live_feedback', String(toggle.checked)); } catch (_) {}
        if (toggle.checked) rows.forEach(enqueue);
    };
    return {
        rows,
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
        destroy() { disposed = true; toggle.onchange = null; }
    };
}
