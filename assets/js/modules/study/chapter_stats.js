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

function recordChapterAttempt(stats, chapterIndex, wasCorrect, moveId) {
    const key = String(chapterIndex);
    const current = stats.chapters[key] || EMPTY_STATS;
    const coveredMoves = Array.isArray(current.coveredMoves) ? current.coveredMoves : [];
    stats.chapters[key] = {
        ...current,
        attempts: current.attempts + 1,
        errors: current.errors + (wasCorrect ? 0 : 1),
        ...(wasCorrect && moveId && !coveredMoves.includes(moveId)
            ? { coveredMoves: [...coveredMoves, moveId] }
            : {})
    };
    return stats;
}

function chapterMoveCatalog(root, playerFirst) {
    const moves = new Set();
    function visit(nodes, path, playerTurn) {
        for (const node of nodes || []) {
            const moveId = [...path, node.move].join('|');
            if (playerTurn) moves.add(moveId);
            visit(node.children, [...path, node.move], !playerTurn);
        }
    }
    visit(root, [], playerFirst);
    return moves;
}

function chapterCoverage(stats, chapterIndex, catalog) {
    const current = stats.chapters[String(chapterIndex)] || EMPTY_STATS;
    const coveredMoves = Array.isArray(current.coveredMoves) ? current.coveredMoves : [];
    const covered = coveredMoves.filter(moveId => catalog.has(moveId)).length;
    return { covered, total: catalog.size, percent: catalog.size ? Math.round(covered / catalog.size * 100) : 0 };
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

function weakChapterOrder(stats, chapterCount) {
    return Array.from({ length: chapterCount }, (_, index) => ({
        index,
        ...chapterWeakness(stats, index)
    }))
        .filter(chapter => chapter.errors > 0)
        .sort((a, b) =>
            b.errors / (b.attempts + 5) - a.errors / (a.attempts + 5) ||
            b.errors - a.errors ||
            a.index - b.index)
        .map(chapter => chapter.index);
}

export { readChapterStats, recordChapterAttempt, chapterMoveCatalog, chapterCoverage, chapterWeakness, weakChapterOrder };
