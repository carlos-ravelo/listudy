const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 17';
const pgn = `[Event "Táctica & variantes"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n17. a8=Q+ {Solución} (17. Kd2 Kd7) Kd7 *`;
let downloaded, prompt, revoked, cleanup;
const context = vm.createContext({
    Blob,
    URL: {createObjectURL: blob => { downloaded = blob; return 'blob:chapter'; },
        revokeObjectURL: url => { revoked = url; }},
    document: {createElement: () => ({click() { this.clicked = true; }, remove() { this.removed = true; }}),
        body: {appendChild: node => { context.download = node; }}},
    window: {alert: value => { prompt = value; }},
    setTimeout: callback => { cleanup = callback; }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/download_pgn.js'), 'utf8')
    .replace(/^export /gm, ''), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/study/lichess_analysis.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);

(async () => {
    const link = context.lichessAnalysisUrl(pgn, 'black', fen, []);
    const url = new URL(link);
    assert.equal(url.origin, 'https://lichess.org');
    assert.equal(decodeURIComponent(url.pathname.slice('/analysis/pgn/'.length)), pgn.replace('{Solución}', ' '));
    assert.equal(url.searchParams.get('color'), 'black');
    assert.equal(url.hash, '#32', 'Use the absolute ply for a custom starting position');
    assert.equal(new URL(context.lichessAnalysisUrl(pgn, 'white', '4k3/Q7/8/8/8/8/8/4K3 b - - 0 17', [0])).hash, '#33');
    assert.equal(new URL(context.lichessAnalysisUrl(pgn, 'white', fen, [1])).hash, '',
        'Do not select an unrelated main-line move when viewing a variation');
    context.prepareLichessAnalysis(pgn, 'Import PGN');
    assert.equal(downloaded, undefined);
    const long = pgn + `\n{${'Comentario largo '.repeat(1000)}}`;
    assert.equal(context.lichessAnalysisUrl(long, 'black', fen), link);
    context.prepareLichessAnalysis(long, 'Import PGN');
    assert.equal(downloaded, undefined, 'Long comments do not trigger the import fallback');
    const annotated = '[Event "Keep {braces}; punctuation"]\n1. e4; Ignore this move: e5\n e5 {[%eval 0.2]} (1... c5) *';
    const sent = decodeURIComponent(new URL(context.lichessAnalysisUrl(annotated, 'white', fen)).pathname.slice('/analysis/pgn/'.length));
    assert.equal(sent, '[Event "Keep {braces}; punctuation"]\n1. e4 \n e5   (1... c5) *');
    context.downloadPgn(long, 'chapter.pgn');
    assert.equal(await downloaded.text(), long, 'Normal downloads retain all comments');
    const largeChapter = long + '\n' + '1. e4 e5 '.repeat(1000);
    assert.equal(context.lichessAnalysisUrl(largeChapter, 'black', fen), 'https://lichess.org/analysis?color=black#menu');
    context.prepareLichessAnalysis(largeChapter, 'Import PGN');
    assert.equal(await downloaded.text(), largeChapter, 'Fallback downloads retain comments and variations');
    assert.equal(context.download.download, 'chapter.pgn');
    assert.equal(context.download.clicked, true);
    assert.equal(context.download.removed, true);
    assert.equal(prompt, 'Import PGN');
    cleanup();
    assert.equal(revoked, 'blob:chapter');
    console.log('Lichess chapter PGN links, custom positions, selected plies and large chapter imports passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
