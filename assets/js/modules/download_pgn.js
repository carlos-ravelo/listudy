export function downloadPgn(pgn, filename) {
    const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
