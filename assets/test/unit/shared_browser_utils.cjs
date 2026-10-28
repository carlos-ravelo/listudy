const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const downloads = [], cleanups = [], revoked = [];
const context = vm.createContext({
    Blob,
    URL: {
        createObjectURL(blob) {
            const url = `blob:${downloads.length}`;
            downloads.push({ blob, url });
            return url;
        },
        revokeObjectURL(url) { revoked.push(url); }
    },
    document: {
        createElement(tag) {
            assert.equal(tag, 'a');
            return {
                click() {
                    assert.equal(this.connected, true);
                    downloads.at(-1).filename = this.download;
                    assert.equal(this.href, downloads.at(-1).url);
                },
                remove() { this.connected = false; }
            };
        },
        body: { appendChild(link) { link.connected = true; downloads.at(-1).link = link; } }
    },
    setTimeout(callback, delay) { assert.equal(delay, 1000); cleanups.push(callback); }
});
for (const file of ['search_text.js', 'pgn/download_pgn.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules', file), 'utf8')
        .replace(/^export /gm, ''), context);
}

(async () => {
    const normalize = context.normalizeSearchText;
    assert.equal(normalize('RÉTI / Grünfeld / ESPAÑOLA'), 'reti / grunfeld / espanola');
    assert.equal(normalize('Re\u0301ti'), normalize('Réti'));
    assert.equal(normalize('  Réti  '), '  reti  ', 'Consumers decide whether to trim spaces');
    assert.equal(normalize(''), '');
    assert.equal(normalize('王 ♔'), '王 ♔');
    const pgn = '[Event "Réti ♔"]\n\n1. Nf3 d5 *\n\n[Event "Segundo"]\n\n1. d4 *';
    context.downloadPgn(pgn, 'réti.pgn');
    context.downloadPgn('1. e4 *', 'listudy-sparring.pgn');
    assert.equal(await downloads[0].blob.text(), pgn);
    assert.equal(downloads[0].blob.type, 'application/x-chess-pgn');
    assert.equal(downloads[0].filename, 'réti.pgn');
    assert.equal(downloads[1].filename, 'listudy-sparring.pgn');
    assert.ok(downloads.every(download => !download.link.connected));
    assert.deepEqual(revoked, [], 'Keep URLs alive until after the download click');
    cleanups[0]();
    assert.deepEqual(revoked, ['blob:0']);
    cleanups[1]();
    assert.deepEqual(revoked, ['blob:0', 'blob:1']);
    console.log('Shared search normalization and PGN payload, filename and deferred cleanup passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
