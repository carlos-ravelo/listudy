import { positionCatalog } from './position_review.js';
const normalizeFen = fen => (fen || '').split(' ').slice(0, 4).join(' ');

function reconcileStudyProgress(stats, trees, catalog, signatures, previousTrees = [], studyColor = 'white') {
    const before = JSON.stringify(stats);
    const oldCatalog = previousTrees.length ? positionCatalog(previousTrees, studyColor) : [];
    trees.forEach((tree, index) => {
        const key = stats.chapterIds?.[index] || String(index);
        const entry = stats.chapters[key];
        if (!entry) return;
        const signature = signatures[index];
        const positions = catalog.filter(item => item.chapter === index);
        const oldIndex = previousTrees.findIndex((old, oldIndex) =>
            (old.headers.ListudyChapterId || String(oldIndex)) === key);
        const oldPositions = oldCatalog.filter(item => item.chapter === oldIndex);
        const findOld = id => oldPositions.find(item => item.id === id);
        const initialFen = normalizeFen(tree.headers.FEN || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        const oldInitialFen = entry.progressFen || (oldIndex >= 0 ? normalizeFen(previousTrees[oldIndex].headers.FEN || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') : null);
        if (oldInitialFen && oldInitialFen !== initialFen) { entry.coveredMoves = []; entry.cleanMoves = []; }
        entry.progressFen = initialFen;
        const reviewSet = entry.positionReviews;
        if (reviewSet) {
            const retained = {};
            for (const item of positions) {
                const review = reviewSet.cards[item.id];
                if (!review) continue;
                const oldFen = review.positionFen || findOld(item.id)?.fen;
                if (oldFen ? normalizeFen(oldFen) !== normalizeFen(item.fen) : reviewSet.signature !== signature) continue;
                review.positionFen = normalizeFen(item.fen);
                review.expected = item.expected;
                if (review.introducedMoves) review.introducedMoves = review.introducedMoves.filter(move => item.expected.includes(move));
                if (review.moveReviews) review.moveReviews = Object.fromEntries(Object.entries(review.moveReviews).filter(([move]) => item.expected.includes(move)));
                retained[item.id] = review;
            }
            entry.positionReviews = { ...reviewSet, signature, cards: retained,
                reconciledAt: reviewSet.signature === signature ? reviewSet.reconciledAt || 0 : Date.now() };
        }
        if (entry.failedPositions) {
            const retained = {};
            for (const item of positions) {
                const failure = entry.failedPositions.positions[item.id];
                if (failure && normalizeFen(failure.fen) === normalizeFen(item.fen)) {
                    retained[item.id] = { ...failure, path: item.path, fen: item.fen, expected: item.expected };
                }
            }
            entry.failedPositions = { ...entry.failedPositions, signature, positions: retained };
        }
        const validMoves = new Set(positions.flatMap(item => item.expected.map(move => (item.id ? item.id + '|' : '') + move)));
        for (const field of ['coveredMoves', 'cleanMoves']) if (entry[field]) entry[field] = entry[field].filter(move => validMoves.has(move));
    });
    return before !== JSON.stringify(stats);
}
export { reconcileStudyProgress };
