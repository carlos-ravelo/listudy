// Lichess truncates inline PGNs at 5,000 characters. Larger chapters are
// downloaded intact so they can be imported from the analysis board.
const inlineLimit = 5000;

export function lichessAnalysisUrl(pgn, orientation, fen, path = []) {
    const base = `https://lichess.org/analysis`;
    if (encodeURIComponent(pgn).length > inlineLimit) return `${base}?color=${orientation}#menu`;
    const fields = fen.split(' ');
    const ply = (Number(fields[5]) - 1) * 2 + (fields[1] === 'b' ? 1 : 0);
    const selected = path.every(index => index === 0) && Number.isInteger(ply) ? `#${ply}` : '';
    return `${base}/pgn/${encodeURIComponent(pgn)}?color=${orientation}${selected}`;
}

export function prepareLichessAnalysis(pgn, importPrompt) {
    if (encodeURIComponent(pgn).length <= inlineLimit) return;
    const url = URL.createObjectURL(new Blob([pgn], {type: 'application/x-chess-pgn'}));
    const download = document.createElement('a');
    download.href = url;
    download.download = 'chapter.pgn';
    document.body.appendChild(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.alert(importPrompt);
}
