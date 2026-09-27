// Preserve the original chapter text, including comments and variations. Results
// inside comments, tag values, or variations must not split the PGN.
export function splitChapterPgn(pgn) {
    const chapters = [];
    let start = 0;
    let inTag = false;
    let inString = false;
    let inComment = false;
    let inLineComment = false;
    let variations = 0;
    for (let i = 0; i < pgn.length; i++) {
        const char = pgn[i];
        if (inLineComment) {
            if (char === '\n') inLineComment = false;
            continue;
        }
        if (inComment) {
            if (char === '}') inComment = false;
            continue;
        }
        if (inString) {
            if (char === '\\') i++;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"' && inTag) inString = true;
        else if (char === '[') inTag = true;
        else if (char === ']') inTag = false;
        else if (!inTag && char === '{') inComment = true;
        else if (!inTag && (char === ';' || (char === '%' && (i === 0 || pgn[i - 1] === '\n')))) inLineComment = true;
        else if (!inTag && char === '(') variations++;
        else if (!inTag && char === ')') variations--;
        else if (!inTag && variations === 0 && (i === 0 || /\s/.test(pgn[i - 1]))) {
            const result = pgn.slice(i).match(/^(?:1\/2-1\/2|1-0|0-1|\*)(?=\s|$)/);
            if (result) {
                const end = i + result[0].length;
                chapters.push(pgn.slice(start, end).trim());
                start = end;
                i = end - 1;
            }
        }
    }
    const tail = pgn.slice(start).trim();
    if (tail) chapters.push(tail);
    return chapters;
}

// An index disambiguates duplicate titles. Verify the title as well so links
// survive reordering when a chapter has a unique name. Never guess by substring.
export function chapterFromUrl(search, titles) {
    const params = new URLSearchParams(search);
    const title = params.get('chapter');
    const index = params.get('chapter_index');
    if (index !== null && /^\d+$/.test(index)) {
        const value = Number(index);
        if (value < titles.length && (!title || titles[value] === title)) return value;
    }
    if (!title) return null;
    const normalize = text => text.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    const exact = titles.map((name, i) => name === title ? i : -1).filter(i => i >= 0);
    if (exact.length === 1) return exact[0];
    const matches = titles.map((name, i) => normalize(name) === normalize(title) ? i : -1).filter(i => i >= 0);
    return matches.length === 1 ? matches[0] : null;
}
