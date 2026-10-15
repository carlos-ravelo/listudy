function practiceDepthLimit(storage, studyId, chapter) {
    const key = `max_depth_${studyId}_${chapter}`;
    if (storage.getItem(key + '_enabled') !== 'true') return Infinity;
    const value = Number(storage.getItem(key));
    return Number.isInteger(value) && value > 0 ? value : Infinity;
}

function scopePositionCatalog(catalog, limits) {
    return catalog.filter(item => Math.floor(item.path.length / 2) + 1 <= (limits[item.chapter] ?? Infinity))
        .map(item => Number.isFinite(limits[item.chapter]) ? { ...item, depthLimit: limits[item.chapter] } : item);
}

function scopeMoveCatalog(catalog, limit) {
    return new Set([...catalog].filter(move => Math.ceil(move.split('|').length / 2) <= limit));
}

export { practiceDepthLimit, scopePositionCatalog, scopeMoveCatalog };
