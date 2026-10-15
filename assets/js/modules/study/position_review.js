import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import { reviewHistory } from './review_history.js';
import ChessModule from 'chess.js';
const Chess = ChessModule.Chess || ChessModule;

const scheduler = fsrs({ learning_steps: ['1m', '10m'], relearning_steps: ['10m'], enable_fuzz: false });
const NEW_POSITION_LIMIT = 10;
const MIN_REVIEW_GAP = 60000;
const NEW_CHAIN_LIMIT = 5;
const MAX_REVIEW_STREAK = 3;

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
                expected: nodes.map(node => node.move), choices: nodes
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
        ...previous,
        history: reviewHistory(previous, now, rating),
        card: result.card,
        recovered: rating === Rating.Good,
        successes: (previous?.successes || 0) + (rating === Rating.Good ? 1 : 0)
    };
    return cards[id];
}

function introducedMoves(stats, chapter, signature, id) {
    const cards = positionReviews(stats, chapter, signature);
    const entry = stats.chapters[stats.chapterIds?.[chapter] || String(chapter)];
    const prefix = id ? id + '|' : '';
    // Existing successful move coverage supplies a non-destructive migration.
    const historical = (entry.coveredMoves || []).filter(move => move.startsWith(prefix))
        .map(move => move.slice(prefix.length)).filter(move => move && !move.includes('|'));
    return [...new Set([...(cards[id]?.introducedMoves || []), ...historical])];
}

function recordIntroducedMove(cards, id, move) {
    if (!cards[id] || !move) return;
    const introduced = cards[id].introducedMoves || [];
    if (!introduced.includes(move)) cards[id].introducedMoves = [...introduced, move];
}

function introduceContinuation(cards, id, move, now = new Date()) {
    const initial = () => ({
        card: createEmptyCard(new Date(now.getTime() + MIN_REVIEW_GAP)),
        introducedAt: now.toISOString(), history: [], recovered: false, successes: 0
    });
    if (!cards[id]) cards[id] = initial();
    const position = cards[id];
    position.moveReviews = { ...position.moveReviews };
    if (!position.moveReviews[move]) position.moveReviews[move] = initial();
    recordIntroducedMove(cards, id, move);
    return position.moveReviews[move];
}

function learningChain(stats, signatures, catalog, item, remaining) {
    const route = [...item.path];
    const decisions = new Map(catalog.filter(candidate => candidate.chapter === item.chapter)
        .map(candidate => [candidate.path.join(','), candidate]));
    let nodes = item.choices;
    let newMoves = 0;
    let lastDecisionDepth = route.length;
    let depthTruncated = false;
    while (nodes?.length) {
        if (Math.floor(route.length / 2) + 1 > (item.depthLimit ?? Infinity)) {
            depthTruncated = true;
            break;
        }
        const decision = decisions.get(route.join(','));
        let index = 0;
        let fresh = false;
        if (decision) {
            const introduced = introducedMoves(stats, item.chapter, signatures[item.chapter], decision.id);
            const unseenIndex = nodes.findIndex(node => !introduced.includes(node.move));
            if (unseenIndex >= 0) index = unseenIndex;
            fresh = !positionReviews(stats, item.chapter, signatures[item.chapter])[decision.id] || unseenIndex >= 0;
            if (fresh && newMoves >= remaining) break;
        }
        const node = nodes[index];
        route.push(index);
        if (decision) lastDecisionDepth = route.length;
        nodes = node.children;
        if (fresh && ++newMoves >= remaining) break;
    }
    route.length = lastDecisionDepth;
    return { ...item, type: 'line', route, newMoves,
        completeLine: !depthTruncated && (!nodes?.length || nodes.every(node => !node.children?.length)) };
}

function recordContinuationReview(cards, id, move, correct, assisted, firstAttempt, isNew, previousCard, now = new Date()) {
    if (!firstAttempt || !cards[id] || !move) return null;
    const moves = cards[id].moveReviews || {};
    const previous = moves[move] || (!isNew && previousCard ? { card: previousCard } : null);
    const temporary = previous ? { [move]: previous } : {};
    const result = recordPositionReview(temporary, move, correct, assisted, new Set(), now);
    if (result) cards[id].moveReviews = { ...moves, [move]: result };
    return result;
}

function scheduledReviews(stats, signature, item) {
    const review = positionReviews(stats, item.chapter, signature)[item.id];
    if (!review) return [];
    const moves = review.moveReviews || {};
    const result = Object.entries(moves).map(([expectedMove, entry]) => ({ review: entry, expectedMove }));
    const introduced = introducedMoves(stats, item.chapter, signature, item.id);
    const untracked = introduced.filter(move => !moves[move]);
    if (!result.length || untracked.length) result.push({ review, expectedMove: untracked[0] || null });
    return result;
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
        const introduced = introducedMoves(stats, item.chapter, signatures[item.chapter], item.id);
        if (!review || item.expected.some(move => !introduced.includes(move))) unseen.push(item);
        if (!review) {
            if (failure && failure.cleanStreak < 3) due.push({ ...item, type: 'position', priority: Infinity, urgent: true });
            continue;
        }
        for (const scheduled of scheduledReviews(stats, signatures[item.chapter], item)) {
            const card = scheduled.review.card;
            const dueAt = new Date(card.due).getTime();
            const availableAt = Math.max(dueAt, new Date(card.last_review || 0).getTime() + MIN_REVIEW_GAP);
            if (availableAt > now.getTime()) {
                if (nextDue === null || availableAt < nextDue) nextDue = availableAt;
                continue;
            }
            const overdue = (now.getTime() - dueAt) / 86400000;
            const missed = !scheduled.review.recovered && (!scheduled.review.introducedAt || card.reps > 0);
            due.push({ ...item, type: 'position', expectedMove: scheduled.expectedMove,
                urgent: missed || overdue >= Math.max(1, card.stability || 1),
                priority: overdue / Math.max(1, card.stability || 1) +
                (missed ? 2 : 0) + (card.lapses || 0) * .1 });
        }
    }
    due.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.priority - a.priority || a.chapter - b.chapter || a.path.length - b.path.length);
    const first = due[0];
    const remaining = NEW_POSITION_LIMIT - session.newCount;
    const canLearn = remaining > 0 && unseen.length > 0;
    // Equal weight by graded decisions; urgent reviews get a short, bounded head start.
    const learn = canLearn && (!first || (session.reviewStreak || 0) >= MAX_REVIEW_STREAK ||
        !first.urgent && session.newCount <= (session.reviewCount || 0));
    if (learn) {
        unseen.sort((a, b) => a.path.length - b.path.length || a.chapter - b.chapter);
        const item = unseen.find(candidate => candidate.path.length === unseen[0].path.length && candidate.chapter !== session.lastChapter) || unseen[0];
        return { target: learningChain(stats, signatures, catalog, item, Math.min(NEW_CHAIN_LIMIT, remaining)), nextDue };
    }
    // Interleave chapters only when both urgency and scheduling priority are comparable.
    const alternate = first && due.find(item => item.chapter !== session.lastChapter && item.urgent === first.urgent && item.priority >= first.priority - .25);
    if (first) return { target: alternate || first, nextDue };
    return { target: null, nextDue };
}

export { positionReviews, positionCatalog, recordPositionReview, introducedMoves, recordIntroducedMove, introduceContinuation, recordContinuationReview, scheduledReviews, learningChain, nextSmartPosition, NEW_POSITION_LIMIT };
