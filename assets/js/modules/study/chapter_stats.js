const EMPTY_STATS = { attempts: 0, errors: 0 };

function beginChapterPractice(stats, chapterIndex, signature, now = Date.now()) {
    finishChapterPractice(stats, chapterIndex, false, now);
    const key = String(chapterIndex);
    const current = stats.chapters[key] || EMPTY_STATS;
    stats.chapters[key] = { ...current, activePractice: {
        attempts: 0, errors: 0, testedMoves: 0, missedMoves: 0, firstResults: {}, signature, startedAt: now
    } };
}

function finishChapterPractice(stats, chapterIndex, completed, now = Date.now()) {
    const current = stats.chapters[String(chapterIndex)];
    if (!current || !current.activePractice) return;
    const practice = { ...current.activePractice, completed, endedAt: now };
    delete practice.firstResults;
    delete current.activePractice;
    if (practice.attempts === 0) return;
    current.lastPractice = practice;
    if (completed) current.practiceSessions = [...(current.practiceSessions || []), practice].slice(-5);
}

function recentPracticePerformance(stats, chapterIndex, signature) {
    const current = stats.chapters[String(chapterIndex)] || EMPTY_STATS;
    const valid = practice => practice?.signature === signature && practice.testedMoves > 0 && Number.isInteger(practice.missedMoves);
    const sessions = (current.practiceSessions || []).filter(valid).slice(-5);
    const moves = sessions.reduce((sum, practice) => sum + practice.testedMoves, 0);
    const missed = sessions.reduce((sum, practice) => sum + practice.missedMoves, 0);
    return {
        count: sessions.length,
        accuracy: moves ? Math.round((moves - missed) / moves * 100) : null,
        last: valid(current.lastPractice) ? current.lastPractice : null,
        active: valid(current.activePractice) ? current.activePractice : null
    };
}

function readChapterStats(raw) {
    if (!raw) return { version: 1, chapters: {} };
    try {
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1 || typeof parsed.chapters !== 'object' || parsed.chapters === null) {
            return { version: 1, chapters: {} };
        }
        Object.keys(parsed.chapters).forEach(index => finishChapterPractice(parsed, index, false));
        return parsed;
    } catch (_error) {
        return { version: 1, chapters: {} };
    }
}

function recordChapterAttempt(stats, chapterIndex, wasCorrect, moveId, positionId = moveId) {
    const key = String(chapterIndex);
    const current = stats.chapters[key] || EMPTY_STATS;
    const coveredMoves = Array.isArray(current.coveredMoves) ? current.coveredMoves : [];
    const cleanMoves = Array.isArray(current.cleanMoves)
        ? current.cleanMoves
        : current.errors === 0 ? coveredMoves : [];
    stats.chapters[key] = {
        ...current,
        attempts: current.attempts + 1,
        errors: current.errors + (wasCorrect ? 0 : 1),
        cleanMoves: wasCorrect
            ? moveId && !cleanMoves.includes(moveId) ? [...cleanMoves, moveId] : cleanMoves
            : [],
        ...(wasCorrect && moveId && !coveredMoves.includes(moveId)
            ? { coveredMoves: [...coveredMoves, moveId] }
            : {})
    };
    if (stats.chapters[key].activePractice) {
        const practice = stats.chapters[key].activePractice;
        practice.attempts += 1;
        practice.errors += wasCorrect ? 0 : 1;
        if (practice.firstResults && positionId !== undefined && positionId !== null &&
            !Object.prototype.hasOwnProperty.call(practice.firstResults, positionId)) {
            practice.firstResults[positionId] = wasCorrect;
            practice.testedMoves += 1;
            practice.missedMoves += wasCorrect ? 0 : 1;
        }
    }
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

function chapterMastery(stats, chapterIndex, catalog) {
    const current = stats.chapters[String(chapterIndex)] || EMPTY_STATS;
    const cleanMoves = Array.isArray(current.cleanMoves)
        ? current.cleanMoves
        : current.errors === 0 && Array.isArray(current.coveredMoves) ? current.coveredMoves : [];
    const cleanCovered = cleanMoves.filter(moveId => catalog.has(moveId)).length;
    return { cleanCovered, mastered: catalog.size > 0 && cleanCovered === catalog.size };
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

function chapterProgressState(stats, chapterIndex, catalog, signature) {
    const coverage = chapterCoverage(stats, chapterIndex, catalog);
    const mastery = chapterMastery(stats, chapterIndex, catalog);
    const recent = recentPracticePerformance(stats, chapterIndex, signature);
    const practice = recent.active || recent.last;
    const errorRate = recent.accuracy !== null ? (100 - recent.accuracy) / 100
        : practice ? practice.missedMoves / practice.testedMoves : 0;
    const hasRecentMistakes = errorRate > 0 || (practice && practice.missedMoves > 0);
    const level = mastery.mastered ? 'solid' : hasRecentMistakes ? errorRate >= .5 ? 'weak' : 'watch' : 'unrated';
    return { ...coverage, ...mastery, recent, errorRate, level };
}

function weakChapterOrder(stats, chapterCount, catalogs = []) {
    return Array.from({ length: chapterCount }, (_, index) => ({
        index,
        ...chapterWeakness(stats, index),
        mastered: catalogs[index] ? chapterMastery(stats, index, catalogs[index]).mastered : false
    }))
        .filter(chapter => chapter.errors > 0 && !chapter.mastered)
        .sort((a, b) =>
            b.errors / (b.attempts + 5) - a.errors / (a.attempts + 5) ||
            b.errors - a.errors ||
            a.index - b.index)
        .map(chapter => chapter.index);
}

export { readChapterStats, recordChapterAttempt, chapterMoveCatalog, chapterCoverage, chapterMastery, chapterWeakness, weakChapterOrder, beginChapterPractice, finishChapterPractice, recentPracticePerformance, chapterProgressState };
