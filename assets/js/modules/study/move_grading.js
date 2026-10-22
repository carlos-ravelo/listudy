import { positionReviews, introduceContinuation, introducedMoves, recordPositionReview, recordContinuationReview, recordIntroducedMove, continuationKey, reviewExposureKey } from './position_review.js';

export function gradeStudyMove({ stats, chapter, signature, positionId, san, possibleMoves, fen,
    wasCorrect, introduction, intendedMove, target, session, presentation, attempts, assisted, metrics, kind }) {
    if (introduction) {
        const cards = positionReviews(stats, chapter, signature);
        introduceContinuation(cards, positionId, introduction);
        cards[positionId].positionFen = fen.split(' ').slice(0, 4).join(' ');
        cards[positionId].expected = possibleMoves;
        session.newCount += 1;
        session.reviewStreak = 0;
        metrics.decision('smart', `${session.presentation}|${chapter}|${positionId}`, true, true, true);
        return { assisted, recovery: null };
    }
    const cards = positionReviews(stats, chapter, signature);
    const firstAttempt = !attempts.has(positionId);
    if (firstAttempt) metrics.decision(kind,
        `${presentation}|${chapter}|${positionId}`, false, wasCorrect, assisted);
    const previousCard = cards[positionId]?.card;
    const wasNew = !cards[positionId] || !introducedMoves(stats, chapter, signature, positionId).includes(intendedMove);
    const review = recordPositionReview(cards, positionId, wasCorrect, assisted, attempts);
    cards[positionId].positionFen = fen.split(' ').slice(0, 4).join(' ');
    cards[positionId].expected = possibleMoves;
    const continuationReview = recordContinuationReview(cards, positionId, intendedMove, wasCorrect, assisted,
        firstAttempt, wasNew, previousCard);
    if (wasCorrect) recordIntroducedMove(cards, positionId, san);
    if (session && firstAttempt) {
        (session.testedContinuations ||= new Set()).add(continuationKey(chapter, positionId, intendedMove));
        if (wasCorrect && !assisted) (session.recalledOpenings ||= new Set()).add(reviewExposureKey(fen, san));
        if (target?.type === 'line' && !target.reviewChain && wasNew) {
            session.newCount += 1;
            session.reviewStreak = 0;
        } else if (review || continuationReview) {
            session.reviewCount = (session.reviewCount || 0) + 1;
            session.reviewStreak = (session.reviewStreak || 0) + 1;
        }
    }
    const recovery = continuationReview || review || cards[positionId];
    const unresolvedContinuation = Object.values(cards[positionId]?.moveReviews || {})
        .some(entry => !entry.recovered && (!entry.introducedAt || entry.card.reps > 0));
    const gradedRecovery = recovery && (!recovery.introducedAt || recovery.card.reps > 0) ? recovery : null;
    return { assisted, recovery: gradedRecovery && { ...gradedRecovery,
        recovered: gradedRecovery.recovered && !unresolvedContinuation } };
}
