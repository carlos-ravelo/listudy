function chapterLearningProgress(stats, chapter, signature, catalog, now = new Date()) {
    const entry = stats.chapters[stats.chapterIds?.[chapter] || String(chapter)] || {};
    const cards = entry.positionReviews?.signature === signature ? entry.positionReviews.cards : {};
    const covered = new Set(entry.coveredMoves || []);
    const events = new Map();
    let newContinuations = 0;
    let dueContinuations = 0;
    for (const item of catalog) {
        if (item.chapter !== Number(chapter)) continue;
        const position = cards[item.id];
        const introduced = new Set(position?.introducedMoves || []);
        const prefix = item.id ? item.id + '|' : '';
        for (const move of new Set(item.expected)) {
            const known = introduced.has(move) || covered.has(prefix + move);
            if (!known) newContinuations++;
            const review = position?.moveReviews?.[move] || (known ? position : null);
            if (!review) continue;
            const due = new Date(review.card?.due).getTime();
            if (Number.isFinite(due) && due <= now.getTime()) dueContinuations++;
            // The initial encounter measures learning, rather than later recall.
            for (const event of (review.history || []).slice(1)) {
                const at = new Date(event.at).getTime();
                if (!Number.isFinite(at) || at > now.getTime() || ![1, 3].includes(event.rating)) continue;
                events.set(event.id || `${item.id}|${event.at}|${event.rating}`, { ...event, at });
            }
        }
    }
    const recent = [...events.values()].sort((a, b) => b.at - a.at).slice(0, 20);
    return {
        newContinuations, dueContinuations, recallSamples: recent.length,
        recallAccuracy: recent.length ? Math.round(recent.filter(event => event.rating === 3).length / recent.length * 100) : null
    };
}

export { chapterLearningProgress };
