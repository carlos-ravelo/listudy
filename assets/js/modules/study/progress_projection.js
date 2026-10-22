import { chapterWeakness, chapterProgressState, chapterCoverage } from './chapter_stats.js';
import { chapterLearningProgress } from './learning_progress.js';
import { pendingPositions } from './failed_positions.js';
import { practiceDepthLimit, scopeMoveCatalog } from './practice_scope.js';

function performanceText(recent, labels) {
    const accuracy = labels.progress_recent_accuracy + ': ' + (recent.accuracy === null ? '—' : recent.accuracy + '%') +
        (recent.count ? ' (' + recent.count + ' ' + (recent.count === 1 ? labels.progress_practice : labels.progress_practices) + ')' : '');
    const practice = recent.active || recent.last;
    if (!practice) return accuracy;
    return accuracy + ' · ' + practiceText(recent, labels);
}

function practiceText(recent, labels) {
    const practice = recent.active || recent.last;
    if (!practice) return labels.progress_no_recent_practice;
    const label = recent.active ? labels.progress_current_practice : labels.progress_last_practice;
    return label + ': ' + practice.missedMoves + '/' + practice.testedMoves + ' ' + labels.progress_moves_missed +
        (!recent.active && !practice.completed ? ' (' + labels.progress_incomplete + ')' : '');
}

export function projectStudyProgress({ stats, moveCatalogs, signatures, catalog, chapterNames,
    currentChapter, storage, studyId, reviews, labels, now = new Date() }) {
    const chapterSummaries = [];

    for (let tree_index in chapterNames) {
        const weakness = chapterWeakness(stats, tree_index);
        const state = chapterProgressState(stats, tree_index, moveCatalogs[tree_index], signatures[tree_index]);
        const limit = practiceDepthLimit(storage, studyId, tree_index);
        const limited = Number.isFinite(limit);
        const scope = chapterCoverage(stats, tree_index, scopeMoveCatalog(moveCatalogs[tree_index], limit));
        const review = reviews[tree_index];
        const entry = stats.chapters[stats.chapterIds?.[tree_index] || String(tree_index)];
        const failures = entry?.failedPositions?.signature === signatures[tree_index]
            ? entry.failedPositions.positions : {};
        const learning = chapterLearningProgress(stats, tree_index, signatures[tree_index], catalog, now);
        const fullCoverageLabel = labels.progress_full_coverage + ': ' + state.covered + '/' + state.total + ' (' + state.percent + '%)';
        const coverageLabel = (limited ? labels.progress_within_depth + ' ' + limit : labels.progress_coverage) +
            ': ' + scope.covered + '/' + scope.total + ' (' + scope.percent + '%)';
        const recallLabel = labels.progress_recall + ': ' + (learning.recallAccuracy === null
            ? labels.progress_recall_unknown
            : learning.recallAccuracy + '% (' + learning.recallSamples + ' ' + labels.progress_graded_reviews + ')');
        const pendingLabel = labels.progress_new + ': ' + learning.newContinuations + ' · ' +
            labels.progress_due_continuations + ': ' + learning.dueContinuations;
        chapterSummaries.push({
            index: Number(tree_index),
            name: chapterNames[tree_index],
            ...weakness,
            ...state,
            ...learning,
            coverageComplete: state.total > 0 && state.covered === state.total,
            scopeComplete: scope.total > 0 && scope.covered === scope.total,
            limited, fullCoverageLabel,
            coverageLabel, recallLabel, pendingLabel,
            progressTooltip: [coverageLabel, ...(limited ? [fullCoverageLabel, labels.progress_scope_help] : []), labels.progress_coverage_help, recallLabel, labels.progress_recall_help,
                pendingLabel, performanceText(state.recent, labels)].join('\n'),
            failedPositions: pendingPositions(failures).length,
            reviewDue: review.due,
            reviewDueAt: review.dueAt ? review.dueAt.getTime() : null,
            reviewLabel: review.due ? labels.spaced_review_due
                : review.dueAt ? labels.spaced_review_next + ": " + review.dueAt.toLocaleString() : null,
            pickerTone: review.due ? 'due'
                : state.recent.accuracy !== null && state.recent.accuracy < 100 ? 'mistakes' : state.covered > 0 ? 'in-progress' : 'new',
            pickerMetrics: scope.percent + '% ' + (limited ? labels.progress_within_depth + ' ' + limit : labels.progress_covered_short) + ' · ' +
                (learning.dueContinuations ? learning.dueContinuations + ' ' + labels.progress_due_short
                    : labels.progress_recall + ' ' + (learning.recallAccuracy === null ? '—' : learning.recallAccuracy + '%')),
            current: Number(tree_index) === Number(currentChapter),
            recovery: coverageLabel,
            metrics: performanceText(state.recent, labels)
        });
    }

    chapterSummaries.sort((a, b) => Number(b.reviewDue) - Number(a.reviewDue) || Number(a.mastered) - Number(b.mastered) || b.errorRate - a.errorRate || b.errors - a.errors || a.index - b.index);
    return chapterSummaries;
}
