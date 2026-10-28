const symbolicGlyphs = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };

export function annotationGlyphs({ move, nags = [] }) {
    const symbolic = symbolicGlyphs[move.match(/[!?]+$/)?.[0]];
    return [...new Set([...(nags || []).map(nag => Number(String(nag).replace('$', ''))),
        ...(symbolic ? [symbolic] : [])])];
}
