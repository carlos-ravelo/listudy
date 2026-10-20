import { positionCatalog } from './position_review.js';

const CACHE_KEY = 'listudy:position-catalog:v1';
const CACHE_LIMIT = 512 * 1024;

function cachedPositionCatalog(trees, color, source, storage) {
    if (storage === undefined) {
        try { storage = window.sessionStorage; } catch (_) { storage = null; }
    }
    try {
        const raw = storage?.getItem(CACHE_KEY);
        const cached = raw && raw.length <= CACHE_LIMIT ? JSON.parse(raw) : null;
        if (cached?.source === source && cached.color === color && Array.isArray(cached.positions)) {
            return cached.positions.map(({ chapter, path, fen }) => {
                if (!Number.isInteger(chapter) || !Array.isArray(path) || typeof fen !== 'string' || !trees[chapter]) throw new Error('Invalid catalog cache');
                let choices = trees[chapter].root;
                const moves = [];
                for (const index of path) {
                    if (!Number.isInteger(index) || index < 0 || !choices[index]) throw new Error('Invalid catalog path');
                    moves.push(choices[index].move);
                    choices = choices[index].children;
                }
                if (!choices?.length) throw new Error('Invalid catalog choices');
                return { chapter, path, id: moves.join('|'), fen,
                    expected: choices.map(node => node.move), choices };
            });
        }
    } catch (_) { /* Rebuild disposable data when storage is unavailable or damaged. */ }

    const catalog = positionCatalog(trees, color);
    try {
        if (source.length <= CACHE_LIMIT) {
            const raw = JSON.stringify({ source, color,
                positions: catalog.map(({ chapter, path, fen }) => ({ chapter, path, fen })) });
            if (raw.length <= CACHE_LIMIT) storage?.setItem(CACHE_KEY, raw);
            else storage?.removeItem(CACHE_KEY);
        } else storage?.removeItem(CACHE_KEY);
    } catch (_) { /* Storage limits must never prevent practice. */ }
    return catalog;
}

export { cachedPositionCatalog };
