const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const read = file => fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8');
const helpers = vm.createContext({ require });
require('./chess_moves_helper.cjs')(helpers);
vm.runInContext(read('modules/engine_line.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), helpers);
const { engineLine } = helpers;
const pv = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4'];
const start = new Chess().fen();
assert.equal(engineLine(start, pv), 'e4 e5 Nf3 Nc6 Bb5 a6');
assert.equal(engineLine(start, pv, 5), 'e4 e5 Nf3 Nc6 Bb5');
assert.equal(engineLine(start, pv, 0), '');
assert.equal(pv.length, 7, 'Rendering does not truncate the engine result');
for (const absent of [null, undefined, [], 'e2e4']) assert.equal(engineLine(start, absent), '');
for (const invalid of ['0000', '(none)', 'e7e9', 'e2e5', null, 'e7e5garbage']) {
    assert.equal(engineLine(start, ['e2e4', invalid, 'g1f3']), 'e4', 'Stop at the first invalid or illegal token');
}
const samples = [
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1', 'e8c8'], 'O-O O-O-O'],
    ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['e5d6'], 'exd6'],
    ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', ['a7a8n'], 'a8=N'],
    ['4k3/8/8/8/8/8/p7/4K3 b - - 0 1', ['a2a1n'], 'a1=N'],
    ['7k/8/5KQ1/8/8/8/8/8 w - - 0 1', ['g6g7', 'h8g8'], 'Qg7#']
];
for (const [fen, moves, san] of samples) assert.equal(engineLine(fen, moves), san);

const sparring = read('modules/sparring/study_adapter.js');
const endgame = read('endgames.js');
const editor = read('study_editor.js');
const sparringContinuation = sparring.slice(sparring.indexOf('    function continuation('), sparring.indexOf('    function result('));
const endgameContinuation = endgame.slice(endgame.indexOf('function continuation('), endgame.indexOf('function selectReview('));
const editorAnalysis = editor.slice(editor.indexOf('        async analyzePosition()'), editor.indexOf('        syncPgn('));

(async () => {
    for (const [fen, moves] of [[start, pv], ...samples]) {
        const board = new Chess(fen), before = board.fen(), history = board.pgn();
        const sparringContext = vm.createContext({ engineLine, ports: { position: { at: () => board } } });
        vm.runInContext(sparringContinuation, sparringContext);
        assert.equal(sparringContext.continuation(0, moves), engineLine(fen, moves));
        const endgameContext = vm.createContext({ engineLine });
        vm.runInContext(endgameContinuation, endgameContext);
        assert.equal(endgameContext.continuation({ before: { fen }, beforeAnalysis: { pv: moves } }), engineLine(fen, moves, 5));
        assert.equal(endgameContext.continuation(null), '');
        const editorContext = vm.createContext({ engineLine, analysisId: 0,
            editor: { position: () => board }, currentChapter: { fen }, config: { analysing: 'Thinking', engineError: 'Failed' },
            enginePosition: () => ({}), engine: { cancel() {}, async analyze() { return { score: { type: 'cp', value: 125 }, pv: moves }; } }
        });
        const component = vm.runInContext('({' + editorAnalysis + '})', editorContext);
        component.analysisEnabled = true;
        await component.analyzePosition();
        const score = board.turn() === 'w' ? '+1.3' : '-1.3';
        assert.equal(component.analysisText, score + ' · ' + engineLine(fen, moves));
        assert.equal(board.fen(), before, 'Displaying a continuation must preserve the caller position');
        assert.equal(board.pgn(), history, 'Displaying a continuation must preserve the caller history');
    }
    console.log('Engine lines: legal prefixes, SAN special moves, both colors and editor/Sparring/endgame adapters passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
