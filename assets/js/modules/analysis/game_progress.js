import { createEmptyCard } from 'ts-fsrs';
import ChessModule from 'chess.js';
import { positionReviews, recordPositionReview, recordContinuationReview, recordIntroducedMove } from '../study/position_review.js';
import { chapterFailures, recordPositionResult } from '../study/failed_positions.js';
import { recordChapterAttempt } from '../study/chapter_stats.js';
const Chess = ChessModule.Chess || ChessModule;

function gamePositionKey(fen) {
    const fields = (fen || '').split(' ').slice(0, 4);
    if (fields[3] && fields[3] !== '-') {
        const chess = new Chess([...fields, '0', '1'].join(' '));
        if (!chess.moves({ verbose: true }).some(move => move.flags.includes('e'))) fields[3] = '-';
    }
    return fields.join(' ');
}

const answers = mistake => (mistake.expected || '').split(/\s+\/\s+/).filter(Boolean).sort();

function gamePositionReference(stats, signatures, catalog, mistake) {
    const key = gamePositionKey(mistake.fen);
    const expected = answers(mistake);
    const candidates = catalog.filter(item => gamePositionKey(item.fen) === key &&
        JSON.stringify([...item.expected].sort()) === JSON.stringify(expected));
    const tracked = item => {
        const entry = stats.chapters[stats.chapterIds?.[item.chapter] || String(item.chapter)]?.positionReviews;
        return entry?.signature === signatures[item.chapter] && entry?.cards?.[item.id];
    };
    return candidates.find(item => tracked(item)?.gameEvidence) || candidates.find(tracked) || candidates[0] || null;
}

function applyGameEvidence(stats, signatures, catalog, mistakes, now = new Date(), authoritative = false) {
    let changed = false;
    const references = new Map();
    for (const mistake of mistakes) {
        const item = gamePositionReference(stats, signatures, catalog, mistake);
        if (!item) continue;
        references.set(mistake, item);
        const at = new Date(mistake.last_played_at).getTime();
        if (!Number.isFinite(at)) continue;
        const cards = positionReviews(stats, item.chapter, signatures[item.chapter]);
        const previous = cards[item.id];
        const evidence = previous?.gameEvidence;
        const gameId = Number(mistake.latest_game_id) || 0;
        if (evidence && (evidence.at > at || evidence.at === at && evidence.gameId >= gameId)) continue;
        const review = previous || { card: createEmptyCard(now), history: [], recovered: false, successes: 0 };
        const lastReview = new Date(review.card.last_review || 0).getTime();
        const pending = at > lastReview || !review.recovered;
        review.gameEvidence = { at, gameId, appliedAt: now.getTime(), pending,
            created: evidence?.created || !previous,
            priorDue: evidence?.pending ? evidence.priorDue : review.card.due,
            priorRecovered: evidence?.pending ? evidence.priorRecovered : review.recovered };
        if (at > lastReview) {
            review.card = { ...review.card, due: new Date(Math.min(new Date(review.card.due).getTime(), now.getTime())) };
            review.recovered = false;
        }
        review.positionFen = item.fen.split(' ').slice(0, 4).join(' ');
        review.expected = item.expected;
        cards[item.id] = review;
        changed = true;
    }
    if (authoritative) {
        const active = new Set([...references.values()].map(item => `${stats.chapterIds?.[item.chapter] || String(item.chapter)}|${item.id}`));
        for (const [chapter, entry] of Object.entries(stats.chapters)) {
            for (const [id, review] of Object.entries(entry.positionReviews?.cards || {})) {
                const evidence = review.gameEvidence;
                if (!evidence || active.has(`${chapter}|${id}`)) continue;
                if (evidence.created && !review.card.reps && !review.history?.length &&
                    !review.introducedMoves?.length && !Object.keys(review.moveReviews || {}).length) {
                    delete entry.positionReviews.cards[id];
                } else {
                    if (new Date(review.card.last_review || 0).getTime() < evidence.at && evidence.priorDue) {
                        review.card = { ...review.card, due: new Date(evidence.priorDue) };
                        review.recovered = evidence.priorRecovered;
                    }
                    delete review.gameEvidence;
                }
                changed = true;
            }
        }
    }
    return { changed, references };
}

function gamePositionPending(stats, mistake, now = new Date()) {
    const expected = answers(mistake);
    const key = gamePositionKey(mistake.fen);
    const at = new Date(mistake.last_played_at).getTime();
    for (const chapter of Object.values(stats.chapters || {})) {
        for (const review of Object.values(chapter.positionReviews?.cards || {})) {
            if (gamePositionKey(review.positionFen) !== key ||
                JSON.stringify([...(review.expected || [])].sort()) !== JSON.stringify(expected)) continue;
            // Any unassisted repertoire answer can recall this position.
            for (const candidate of [review, ...expected.map(move => review.moveReviews?.[move]).filter(Boolean)]) {
                if (candidate.recovered && new Date(candidate.card?.last_review || 0).getTime() >= at &&
                    new Date(candidate.card?.due).getTime() > now.getTime()) return false;
            }
        }
    }
    return true;
}

function recordGamePractice(stats, signatures, item, san, correct, assisted, attempted, now = new Date()) {
    const first = !attempted.has(item.id);
    const cards = positionReviews(stats, item.chapter, signatures[item.chapter]);
    const move = correct ? san : item.expected[0];
    const previousCard = cards[item.id]?.card;
    const isNew = !cards[item.id]?.introducedMoves?.includes(move);
    const position = recordPositionReview(cards, item.id, correct, assisted, attempted, now);
    const continuation = recordContinuationReview(cards, item.id, move, correct, assisted, first, isNew, previousCard, now);
    cards[item.id].positionFen = item.fen.split(' ').slice(0, 4).join(' ');
    cards[item.id].expected = item.expected;
    if (correct) recordIntroducedMove(cards, item.id, san);
    const clean = correct && !assisted;
    recordChapterAttempt(stats, item.chapter, correct, clean ? (item.id ? item.id + '|' : '') + san : null, item.id, assisted);
    const recovery = continuation || position || cards[item.id];
    const unresolved = Object.values(cards[item.id].moveReviews || {}).some(entry => !entry.recovered);
    recordPositionResult(chapterFailures(stats, item.chapter, signatures[item.chapter]), item.id,
        { path: item.path, fen: item.fen, played: san, expected: item.expected }, correct,
        { ...recovery, recovered: recovery.recovered && !unresolved });
    return first;
}

function gameLineTarget(catalog, fen, expected, chapter) {
    const item = gamePositionReference({ chapters: {} }, [], catalog.filter(item => item.chapter === chapter), { fen, expected });
    if (!item) return null;
    const start = catalog.filter(candidate => candidate.chapter === chapter &&
        candidate.path.every((index, depth) => item.path[depth] === index))
        .sort((a, b) => a.path.length - b.path.length)[0];
    const route = [...item.path];
    let nodes = item.choices;
    let end = route.length;
    while (nodes?.length) {
        if (Math.floor(route.length / 2) + 1 > (item.depthLimit ?? Infinity)) break;
        route.push(0);
        if (catalog.some(candidate => candidate.chapter === chapter && candidate.path.length === route.length - 1 &&
            candidate.path.every((index, depth) => route[depth] === index))) end = route.length;
        nodes = nodes[0].children;
    }
    route.length = end;
    return { ...start, type: 'line', reviewChain: true, route, expectedMove: null, newMoves: 0,
        completeLine: !nodes?.length, fromGame: true };
}

export { gamePositionKey, gamePositionReference, applyGameEvidence, gamePositionPending, recordGamePractice, gameLineTarget };
