import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
const positionScheduler = fsrs({ learning_steps: ['1m', '10m'], relearning_steps: ['10m'], enable_fuzz: false });
const chapterScheduler = fsrs({ learning_steps: ['10m'], relearning_steps: ['10m'], enable_fuzz: false });
const counters = new Set(['attempts', 'errors', 'failures', 'successes']);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const time = entry => new Date(entry?.card?.last_review || entry?.lastResultAt || entry?.endedAt || entry?.startedAt || 0).getTime();

function mergeReview(base, local, remote, kind) {
    const histories = new Map([...(local.history || []), ...(remote.history || [])].map(event => [event.id, event]));
    const known = new Set((base?.history || []).map(event => event.id));
    const events = [...histories.values()].filter(event => !known.has(event.id))
        .sort((a, b) => new Date(a.at) - new Date(b.at) || a.id.localeCompare(b.id));
    const latest = time(local) >= time(remote) ? local : remote;
    const result = { ...clone(latest), history: [...histories.values()].sort((a, b) => new Date(a.at) - new Date(b.at) || a.id.localeCompare(b.id)).slice(-128) };
    // Replay both devices' new evidence through FSRS rather than inventing merged intervals.
    if (events.length && local.history && remote.history) {
        const scheduler = kind === 'chapter' ? chapterScheduler : positionScheduler;
        let card = base?.card || createEmptyCard(new Date(events[0].at));
        let recovered = base?.recovered;
        for (const event of events) {
            const at = new Date(event.at);
            if (event.rating === Rating.Good && card.last_review &&
                (at - new Date(card.last_review) < 60000 || new Date(card.due) > at)) continue;
            card = scheduler.next(card, at, event.rating).card;
            recovered = event.rating === Rating.Good;
        }
        result.card = card;
        if (kind !== 'chapter') result.recovered = recovered;
    } else {
        // Legacy attempts lack event IDs: retain the other scheduler snapshot as a backup.
        result.concurrentCards = [...new Map([...(local.concurrentCards || []), ...(remote.concurrentCards || []),
            local.card, remote.card].filter(Boolean).map(card => [JSON.stringify(card), card])).values()].slice(-8);
    }
    result.successes = (base?.successes || 0) + Math.max(0, (local.successes || 0) - (base?.successes || 0)) + Math.max(0, (remote.successes || 0) - (base?.successes || 0));
    result.introducedMoves = [...new Set([...(local.introducedMoves || []), ...(remote.introducedMoves || [])])];
    if (local.moveReviews || remote.moveReviews) result.moveReviews = mergeNode(base?.moveReviews, local.moveReviews || {}, remote.moveReviews || {}, 'moveReviews', kind);
    return result;
}

function mergeNode(base, local, remote, field, kind) {
    if (field === 'studySessions') {
        const sessions = {};
        for (const id of new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])) {
            const candidates = [local?.[id], remote?.[id]].filter(Boolean);
            candidates.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) ||
                Number(b.status !== 'active') - Number(a.status !== 'active') ||
                (b.newCount + b.reviewCount) - (a.newCount + a.reviewCount));
            sessions[id] = clone(candidates[0]);
        }
        return sessions;
    }
    if (counters.has(field) && typeof local === 'number' && typeof remote === 'number') {
        return (base || 0) + Math.max(0, local - (base || 0)) + Math.max(0, remote - (base || 0));
    }
    if (same(local, remote)) return clone(local);
    if (same(local, base)) return clone(remote);
    if (same(remote, base)) return clone(local);
    if (local === undefined) return clone(remote);
    if (remote === undefined) return clone(local);
    if (field === 'activePractice') return clone(local);
    if (field === 'lastPractice') return clone(time(local) >= time(remote) ? local : remote);
    if (Array.isArray(local) && Array.isArray(remote)) {
        if (field === 'chapterIds' || field === 'path' || field === 'expected') return clone(local);
        const removed = new Set((base || []).filter(value => !local.some(item => same(item, value)) || !remote.some(item => same(item, value))).map(value => JSON.stringify(value)));
        const union = [...new Map([...local, ...remote].map(value => [JSON.stringify(value), value])).entries()]
            .filter(([key]) => !removed.has(key)).map(([, value]) => clone(value));
        if (field === 'practiceSessions') return union.sort((a, b) => time(a) - time(b)).slice(-5);
        return union;
    }
    if (local && remote && typeof local === 'object' && typeof remote === 'object') {
        if (local.card && remote.card) return mergeReview(base, local, remote, kind);
        const result = {};
        for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
            result[key] = mergeNode(base?.[key], local[key], remote[key], key, kind);
        }
        if (local.signature !== remote.signature && (local.reconciledAt || remote.reconciledAt)) {
            result.signature = (local.reconciledAt || 0) >= (remote.reconciledAt || 0) ? local.signature : remote.signature;
        }
        if ('recovered' in local && 'recovered' in remote && !local.card) {
            result.recovered = time(local) >= time(remote) ? local.recovered : remote.recovered;
        }
        return result;
    }
    return clone(local);
}

function mergeProgress(base, local, remote, key = '') {
    const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
    base = base ? decode(base) : null;
    local = local ? decode(local) : null;
    remote = remote ? decode(remote) : null;
    if (local?.resetId !== base?.resetId || remote?.resetId !== base?.resetId) {
        const resets = [local, remote].filter(value => value && value.resetId !== base?.resetId);
        if (resets.length) {
            const result = clone(resets.sort((a, b) => (b.resetAt || 0) - (a.resetAt || 0) || String(b.resetId).localeCompare(String(a.resetId)))[0]);
            if (local?.studySessions || remote?.studySessions) result.studySessions = mergeNode(null, local?.studySessions, remote?.studySessions, 'studySessions', 'position');
            return result;
        }
    }
    return mergeNode(base, local, remote, '', key.endsWith('_chapter_reviews') ? 'chapter' : 'position');
}
export { mergeProgress };
