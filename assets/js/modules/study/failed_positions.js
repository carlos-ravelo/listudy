function chapterFailures(stats, chapter, signature) {
    const key = stats.chapterIds?.[chapter] || String(chapter);
    const entry = stats.chapters[key] || (stats.chapters[key] = { attempts: 0, errors: 0 });
    if (entry.failedPositions?.signature !== signature) {
        entry.failedPositions = { signature, positions: {} };
    }
    return entry.failedPositions.positions;
}

function recordPositionResult(positions, id, details, correct, review = null) {
    const previous = positions[id];
    if (previous) previous.lastResultAt = Date.now();
    if (correct && review && !review.recovered) {
        positions[id] = { ...details, ...previous, failures: previous?.failures || 0,
            cleanStreak: 0, lastFailedAt: previous?.lastFailedAt || Date.now(), recovered: false };
        return;
    }
    if (correct) {
        if (previous && review) previous.recovered = review.recovered;
        else if (previous && previous.recovered === undefined) previous.cleanStreak += 1;
        return;
    }
    positions[id] = {
        ...details,
        failures: (previous?.failures || 0) + 1,
        cleanStreak: 0,
        ...(review ? { recovered: false } : {}),
        lastResultAt: Date.now(),
        lastFailedAt: Date.now()
    };
}

function pendingPositions(positions) {
    return Object.values(positions)
        .filter(position => position.recovered === undefined ? position.cleanStreak < 3 : !position.recovered)
        .sort((a, b) => b.failures - a.failures || b.lastFailedAt - a.lastFailedAt);
}

export { chapterFailures, recordPositionResult, pendingPositions };
