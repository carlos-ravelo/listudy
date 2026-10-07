import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';

// A mistake schedules a retry after ten minutes; a clean line schedules the next review.
const scheduler = fsrs({ learning_steps: ['10m'], relearning_steps: ['10m'] });

function emptyChapterReviews() {
    return { version: 1, chapters: {} };
}

function readChapterReviews(raw) {
    if (!raw) return emptyChapterReviews();
    try {
        const parsed = JSON.parse(raw);
        return parsed.version === 1 && parsed.chapters && typeof parsed.chapters === 'object'
            ? parsed
            : emptyChapterReviews();
    } catch (_error) {
        return emptyChapterReviews();
    }
}

function chapterReviewSignature(root, fen) {
    const moves = JSON.stringify((function moveShape(nodes) {
        return (nodes || []).map(node => ({ move: node.move, children: moveShape(node.children) }));
    })(root));
    const source = `${fen || ''}|${moves}`;
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++) {
        hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
    }
    return (hash >>> 0).toString(36);
}

function savedCard(reviews, chapterIndex, signature) {
    const entry = reviews.chapters[reviews.chapterIds?.[chapterIndex] || String(chapterIndex)];
    if (!entry || entry.signature !== signature || !entry.card) return null;
    const due = new Date(entry.card.due);
    return Number.isFinite(due.getTime()) ? entry.card : null;
}

function recordLineReview(reviews, chapterIndex, signature, wasClean, now = new Date()) {
    const key = reviews.chapterIds?.[chapterIndex] || String(chapterIndex);
    const previous = savedCard(reviews, key, signature) || createEmptyCard(now);
    const rating = wasClean ? Rating.Good : Rating.Again;
    let result;
    try {
        result = scheduler.next(previous, now, rating);
    } catch (_error) {
        result = scheduler.next(createEmptyCard(now), now, rating);
    }
    reviews.chapters[key] = { signature, card: result.card };
    return result.card;
}

function chapterReviewStatus(reviews, chapterIndex, signature, now = new Date()) {
    const card = savedCard(reviews, chapterIndex, signature);
    if (!card) return { due: false, dueAt: null };
    const dueAt = new Date(card.due);
    return { due: dueAt <= now, dueAt };
}

function dueChapterOrder(reviews, signatures, now = new Date()) {
    return signatures
        .map((signature, index) => ({ index, ...chapterReviewStatus(reviews, index, signature, now) }))
        .filter(chapter => chapter.due)
        .sort((a, b) => a.dueAt - b.dueAt || a.index - b.index)
        .map(chapter => chapter.index);
}

export { emptyChapterReviews, readChapterReviews, chapterReviewSignature, recordLineReview, chapterReviewStatus, dueChapterOrder };
