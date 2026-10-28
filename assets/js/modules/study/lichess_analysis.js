import { downloadPgn } from '../pgn/download_pgn.js';

// Lichess truncates inline PGNs at 5,000 characters. Larger chapters are
// downloaded intact so they can be imported from the analysis board.
const inlineLimit = 5000;

function analysisPgn(pgn) {
    return pgn.replace(/"(?:\\.|[^"\\])*"|\{[^}]*\}|;[^\r\n]*/g,
        token => token.startsWith('"') ? token : ' ').trim();
}

export function lichessAnalysisUrl(pgn, orientation, fen, path = []) {
    pgn = analysisPgn(pgn);
    const base = `https://lichess.org/analysis`;
    if (encodeURIComponent(pgn).length > inlineLimit) return `${base}?color=${orientation}#menu`;
    const fields = fen.split(' ');
    const ply = (Number(fields[5]) - 1) * 2 + (fields[1] === 'b' ? 1 : 0);
    const selected = path.every(index => index === 0) && Number.isInteger(ply) ? `#${ply}` : '';
    return `${base}/pgn/${encodeURIComponent(pgn)}?color=${orientation}${selected}`;
}

export function prepareLichessAnalysis(pgn, importPrompt) {
    if (encodeURIComponent(analysisPgn(pgn)).length <= inlineLimit) return;
    downloadPgn(pgn, 'chapter.pgn');
    window.alert(importPrompt);
}
