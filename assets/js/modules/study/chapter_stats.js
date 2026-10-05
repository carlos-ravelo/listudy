const EMPTY_STATS = { attempts: 0, errors: 0 };

function readChapterStats(raw) {
    if (!raw) return { version: 1, chapters: {} };
    try {
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1 || typeof parsed.chapters !== 'object' || parsed.chapters === null) {
            return { version: 1, chapters: {} };
        }
        return parsed;
    } catch (_error) {
        return { version: 1, chapters: {} };
    }
}

function recordChapterAttempt(stats, chapterIndex, wasCorrect) {
    const key = String(chapterIndex);
    const current = stats.chapters[key] || EMPTY_STATS;
    stats.chapters[key] = {
        attempts: current.attempts + 1,
        errors: current.errors + (wasCorrect ? 0 : 1)
    };
    return stats;
}

function chapterWeakness(stats, chapterIndex) {
    const current = stats.chapters[String(chapterIndex)] || EMPTY_STATS;
    const errorRate = current.attempts === 0 ? 0 : current.errors / current.attempts;
    let level = 'unrated';
    if (current.errors > 0) {
        level = errorRate >= 0.5 ? 'weak' : 'watch';
    } else if (current.attempts > 0) {
        level = 'solid';
    }
    return { ...current, errorRate, level };
}

export { readChapterStats, recordChapterAttempt, chapterWeakness };
