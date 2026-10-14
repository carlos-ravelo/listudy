function chapterFailures(stats, chapter, signature) {
    const key = stats.chapterIds?.[chapter] || String(chapter);
    const entry = stats.chapters[key] || (stats.chapters[key] = { attempts: 0, errors: 0 });
    if (entry.failedPositions?.signature !== signature) {
        entry.failedPositions = { signature, positions: {} };
    }
    return entry.failedPositions.positions;
}

function recordPositionResult(positions, id, details, correct) {
    const previous = positions[id];
    if (correct) {
        if (previous) previous.cleanStreak += 1;
        return;
    }
    positions[id] = {
        ...details,
        failures: (previous?.failures || 0) + 1,
        cleanStreak: 0,
        lastFailedAt: Date.now()
    };
}

function pendingPositions(positions) {
    return Object.values(positions)
        .filter(position => position.cleanStreak < 3)
        .sort((a, b) => b.failures - a.failures || b.lastFailedAt - a.lastFailedAt);
}

export { chapterFailures, recordPositionResult, pendingPositions };
