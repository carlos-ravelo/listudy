import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import ChessModule from 'chess.js';
const Chess = ChessModule.Chess || ChessModule;

const scheduler = fsrs({ learning_steps: ['1m', '10m'], relearning_steps: ['10m'], enable_fuzz: false });
const NEW_POSITION_LIMIT = 10;
const MIN_REVIEW_GAP = 60000;

function positionReviews(stats, chapter, signature) {
    const key = stats.chapterIds?.[chapter] || String(chapter);
    const entry = stats.chapters[key] || (stats.chapters[key] = { attempts: 0, errors: 0 });
    if (entry.positionReviews?.signature !== signature) {
        entry.positionReviews = { signature, cards: {} };
    }
    return entry.positionReviews.cards;
}

function positionCatalog(trees, studyColor) {
    const catalog = [];
    trees.forEach((tree, chapter) => {
        const chess = new Chess(tree.headers.FEN);
        if (tree.headers.FEN && !chess.load(tree.headers.FEN)) return;
        const custom = chess.fen().split(' ').slice(0, 4).join(' ') !==
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
        const player = custom ? chess.turn() : studyColor === 'white' ? 'w' : 'b';
        function visit(nodes, path, moves) {
            if (!nodes?.length) return;
            if (chess.turn() === player) catalog.push({
                chapter, path: [...path], id: moves.join('|'), fen: chess.fen(),
                expected: nodes.map(node => node.move)
            });
            nodes.forEach((node, index) => {
                if (!chess.move(node.move)) return;
                visit(node.children, [...path, index], [...moves, node.move]);
                chess.undo();
            });
        }
        visit(tree.root, [], []);
    });
    return catalog;
}

function recordPositionReview(cards, id, correct, assisted, attempted, now = new Date()) {
    if (attempted.has(id)) return null;
    attempted.add(id);
    const previous = cards[id];
    // Early drills must not shorten an existing interval or inflate memory strength.
    if (correct && !assisted && previous && new Date(previous.card.due) > now) return null;
    if (previous && now.getTime() - new Date(previous.card.last_review).getTime() < MIN_REVIEW_GAP && correct && !assisted) return null;
    const rating = correct && !assisted ? Rating.Good : Rating.Again;
    let result;
    try {
        result = scheduler.next(previous?.card || createEmptyCard(now), now, rating);
    } catch (_error) {
        result = scheduler.next(createEmptyCard(now), now, rating);
    }
    cards[id] = {
        card: result.card,
        recovered: rating === Rating.Good,
        successes: (previous?.successes || 0) + (rating === Rating.Good ? 1 : 0)
    };
    return cards[id];
}

function nextSmartPosition(stats, signatures, catalog, session, now = new Date()) {
    const due = [];
    const unseen = [];
    let nextDue = null;
    for (const item of catalog) {
        const cards = positionReviews(stats, item.chapter, signatures[item.chapter]);
        const review = cards[item.id];
        const chapter = stats.chapters[stats.chapterIds?.[item.chapter] || String(item.chapter)];
        const failure = chapter.failedPositions?.signature === signatures[item.chapter]
            ? chapter.failedPositions.positions[item.id] : null;
        if (!review) {
            if (failure && failure.cleanStreak < 3) due.push({ ...item, type: 'position', priority: Infinity });
            else unseen.push({ ...item, type: 'line' });
            continue;
        }
        const dueAt = new Date(review.card.due).getTime();
        const availableAt = Math.max(dueAt, new Date(review.card.last_review || 0).getTime() + MIN_REVIEW_GAP);
        if (availableAt > now.getTime()) {
            if (nextDue === null || availableAt < nextDue) nextDue = availableAt;
            continue;
        }
        due.push({ ...item, type: 'position', priority:
            (now.getTime() - dueAt) / Math.max(1, review.card.stability || 1) / 86400000 +
            (review.recovered ? 0 : 2) + (review.card.lapses || 0) * .1 });
    }
    due.sort((a, b) => b.priority - a.priority || a.chapter - b.chapter || a.path.length - b.path.length);
    // Prefer a different chapter when urgency is comparable, to interleave learning.
    const first = due[0];
    const alternate = first && due.find(item => item.chapter !== session.lastChapter && item.priority >= first.priority - .25);
    if (first) return { target: alternate || first, nextDue };
    if (session.newCount < NEW_POSITION_LIMIT) {
        unseen.sort((a, b) => a.path.length - b.path.length || a.chapter - b.chapter);
        return { target: unseen.find(item => item.chapter !== session.lastChapter) || unseen[0] || null, nextDue };
    }
    return { target: null, nextDue };
}

export { positionReviews, positionCatalog, recordPositionReview, nextSmartPosition, NEW_POSITION_LIMIT };
