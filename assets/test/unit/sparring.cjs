const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ require, setTimeout, clearTimeout, stockfishVersion: require('../../stockfish.config.js').version });
require('./chess_moves_helper.cjs')(context);
for (const file of ['sparring/evaluation', 'sparring/session', 'sparring/chess_adapter', 'engine/uci_engine']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../../js/modules/${file}.js`), 'utf8')
        .replace(/^import .*\n/gm, '').replace(/^export /gm, ''), context);
}
const { createSparringSession, createChapterSparring, createStudySparring, sparringStartPositions, createSparringEngine, createSparringChapterRotation } = context;
const chapter = { headers: {}, root: [{ move: 'e4', children: [
    { move: 'e5', children: [{ move: 'Nf3', children: [] }] },
    { move: 'c5', children: [] }
] }] };
const plain = value => JSON.parse(JSON.stringify(value));
function make({ source = chapter, player = 'w', random = () => 0, bestMove = async () => 'b8c6' } = {}) {
    const ports = createChapterSparring(source);
    const calls = [];
    let disposed = false;
    const session = createSparringSession({ ...ports, player, random,
        engine: { async bestMove(state) { calls.push(plain(state)); return bestMove(state); }, dispose() { disposed = true; } } });
    return { session, calls, get disposed() { return disposed; } };
}
(async () => {
    const original = JSON.stringify(chapter);
    const { session, calls } = make();
    await session.start();
    const initial = session.snapshot().fen;
    assert.equal(await session.move('e2e5'), false);
    assert.equal(session.snapshot().attempts, 0);
    assert.equal(await session.move('d2d4'), false);
    assert.equal(session.snapshot().fen, initial);
    assert.equal(session.snapshot().feedback, 'outside');
    assert.equal(session.snapshot().attempts, 1);
    assert.equal(await session.move('e2e4'), true);
    assert.deepEqual(plain(session.snapshot().moves), ['e2e4', 'e7e5']);
    assert.equal(session.snapshot().correct, 0);
    assert.equal(session.snapshot().phase, 'theory');
    await session.move('g1f3');
    assert.equal(session.snapshot().phase, 'free');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].moves, ['e2e4', 'e7e5', 'g1f3']);
    assert.equal(session.snapshot().correct, 1);
    assert.equal(JSON.stringify(chapter), original);

    const black = make({ player: 'b' });
    await black.session.start();
    assert.deepEqual(plain(black.session.snapshot().moves), ['e2e4']);
    assert.equal(black.session.snapshot().canPlay, true);
    black.session.hint();
    await black.session.move('e7e5');
    assert.equal(black.session.snapshot().correct, 0);
    assert.equal(black.session.snapshot().phase, 'free');
    assert.equal(black.calls.length, 0);

    const alternate = make({ random: () => 0.99 });
    await alternate.session.start();
    await alternate.session.move('e2e4');
    assert.deepEqual(plain(alternate.session.snapshot().moves), ['e2e4', 'c7c5']);
    assert.equal(alternate.session.snapshot().phase, 'free');

    const promotion = make({ source: { headers: { FEN: '7k/P7/8/8/8/8/8/7K w - - 0 1' },
        root: [{ move: 'a8=N', children: [] }] } });
    await promotion.session.start();
    assert.equal(await promotion.session.move('a7a8n'), true);
    assert.equal(promotion.session.snapshot().phase, 'finished');
    assert.equal(promotion.calls.length, 0);

    let release;
    const late = make({ source: { headers: {}, root: [] }, bestMove: () => new Promise(resolve => { release = resolve; }) });
    await late.session.start();
    const pending = late.session.move('e2e4');
    assert.equal(late.session.snapshot().thinking, true);
    assert.equal(await late.session.move('d2d4'), false);
    late.session.dispose();
    release('e7e5');
    await pending;
    assert.equal(late.disposed, true);
    assert.deepEqual(plain(late.session.snapshot().moves), ['e2e4']);

    let fails = true;
    const retry = make({ source: { headers: {}, root: [] }, bestMove: async () => {
        if (fails) throw new Error('offline');
        return 'e7e5';
    } });
    await retry.session.start();
    await retry.session.move('e2e4');
    assert.equal(retry.session.snapshot().error, 'opponent');
    fails = false;
    await retry.session.continueWithEngine();
    assert.equal(retry.session.snapshot().error, null);
    assert.equal(retry.session.snapshot().canPlay, true);

    const messages = [];
    let worker;
    const engine = createSparringEngine({ createWorker() {
        worker = { terminate() { this.stopped = true; }, postMessage(message) {
            messages.push(message);
            const reply = message === 'uci' ? 'uciok' : message === 'isready' ? 'readyok'
                : message.startsWith('go ') ? 'bestmove e7e5 ponder g1f3' : null;
            if (message === 'uci') queueMicrotask(() => worker.onmessage({data:'option name UCI_Elo type spin default 1320 min 1320 max 3190'}));
            if (reply) queueMicrotask(() => worker.onmessage({ data: reply }));
        } };
        return worker;
    } });
    assert.equal(await engine.bestMove({ initialFen: initial, moves: ['e2e4'] }), 'e7e5');
    assert(messages.indexOf('uci') < messages.indexOf('isready'));
    assert(messages.includes(`position fen ${initial} moves e2e4`));
    engine.dispose();
    assert.equal(worker.stopped, true);
    await assert.rejects(engine.bestMove({ initialFen: initial, moves: [] }), /disposed/);

    let deadWorker;
    const waitingEngine = createSparringEngine({ createWorker() {
        deadWorker = { terminate() {}, postMessage() {} }; return deadWorker;
    } });
    const waiting = waitingEngine.bestMove({ initialFen: initial, moves: [] });
    waitingEngine.dispose();
    await assert.rejects(waiting, /disposed/);

    const timedOut = createSparringEngine({ timeoutMs: 5, createWorker: () => ({ terminate() {}, postMessage() {} }) });
    await assert.rejects(timedOut.bestMove({ initialFen: initial, moves: [] }), /timeout/);
    timedOut.dispose();
    const { winningChances, assessMove } = context;
    assert.equal(winningChances({ type: 'mate', value: 0 }, 'b', 'w'), 100);
    assert.equal(winningChances({ type: 'mate', value: 0 }, 'w', 'w'), 0);
    assert.equal(assessMove({ score: { type: 'cp', value: 100 }, turn: 'b' },
        { score: { type: 'cp', value: -100 }, turn: 'w' }, 'b').loss, 0);
    const { lossJudgement, sparringStrength } = context;
    assert.equal(lossJudgement(4.999), null);
    assert.equal(lossJudgement(5), 'inaccuracy');
    assert.equal(lossJudgement(10), 'mistake');
    assert.equal(lossJudgement(15), 'blunder');
    const beforeMove = { score: { type: 'cp', value: 0 }, turn: 'w', uci: 'e2e4' };
    const afterMove = { score: { type: 'cp', value: 33 }, turn: 'b' };
    assert.equal(assessMove(beforeMove, afterMove, 'w', 'd2d4').grade, 'acceptable');
    assert.equal(assessMove(beforeMove, { ...afterMove, score: {type:'cp',value:0} }, 'w', 'e2e4').grade, 'best');
    assert.equal(assessMove(beforeMove, { score: {type:'mate',value:2}, turn:'b' }, 'w', 'e2e4').grade, 'blunder');
    assert.equal(assessMove({ ...beforeMove, score: {type:'cp',value:-800} }, { score:{type:'mate',value:2},turn:'b' }, 'w').grade, 'mistake');
    assert.equal(assessMove({ ...beforeMove, score: {type:'cp',value:-1000} }, { score:{type:'mate',value:2},turn:'b' }, 'w').grade, 'inaccuracy');
    assert.equal(assessMove({ score:{type:'mate',value:3},turn:'w' }, { score:{type:'cp',value:-800},turn:'b' }, 'w').grade, 'acceptable');
    assert.equal(assessMove({ score:{type:'mate',value:3},turn:'w' }, { score:{type:'cp',value:-1000},turn:'b' }, 'w').grade, 'acceptable');
    assert.equal(assessMove({ score:{type:'mate',value:-3},turn:'w' }, { score:{type:'mate',value:0},turn:'w' }, 'w').grade, 'acceptable');
    for (const player of ['w', 'b']) {
        const opponent = player === 'w' ? 'b' : 'w';
        const mateInThree = {score: {type: 'mate', value: 3}, turn: player, uci: 'a1a2'};
        assert.equal(assessMove(mateInThree, {score: {type: 'mate', value: -2}, turn: opponent}, player, 'h1h2').grade, 'best', 'An equally fast mating alternative is also best');
        assert.equal(assessMove(mateInThree, {score: {type: 'mate', value: -3}, turn: opponent}, player, 'h1h2').grade, 'acceptable', 'A slower mate retains the win without being an equally fast alternative');
        assert.equal(assessMove(mateInThree, {score: {type: 'mate', value: 0}, turn: opponent}, player, 'h1h2').grade, 'best', 'Delivering mate deserves best regardless of the principal variation');
        assert.equal(assessMove(mateInThree, {score: {type: 'cp', value: 0}, turn: opponent}, player, 'h1h2').grade, 'blunder', 'Losing the forced mate still receives the existing error assessment');
    }
    assert.equal(sparringStrength(null), 2);
    assert.equal(sparringStrength('1'), 1);
    assert.equal(sparringStrength(8), 8);
    assert.equal(sparringStrength(99), 2);
    assert.equal(context.sparringRating(1),1320);
    assert.equal(context.sparringRating(2),1500);
    assert.equal(context.sparringRating(8),null);

    const workers = [];
    const separated = createSparringEngine({ createWorker() {
        const fake = { messages: [], limited: false, stopped: false,
            terminate() { this.stopped = true; }, postMessage(message) {
                this.messages.push(message);
                if (message.startsWith('setoption name UCI_LimitStrength')) this.limited = message.endsWith('true');
                const reply = message === 'uci' ? 'uciok' : message === 'isready' ? 'readyok' : null;
                if (message === 'uci') queueMicrotask(() => this.onmessage({data:'option name UCI_Elo type spin default 1320 min 1320 max 3190'}));
                if (reply) queueMicrotask(() => this.onmessage({data:reply}));
                if (message.startsWith('go ')) queueMicrotask(() => {
                    this.onmessage({data:'info depth 18 multipv 1 score cp 20 pv e7e5 g1f3'});
                    this.onmessage({data:'info depth 4 multipv 2 score cp 999 pv c7c5'});
                    this.onmessage({data:`bestmove ${!this.limited ? 'e7e5' : 'c7c5'}`});
                });
            } };
        workers.push(fake); return fake;
    } });
    const enginePosition = { initialFen: initial, moves: ['e2e4'] };
    assert.equal(await separated.bestMove(enginePosition), 'c7c5');
    assert(workers[0].messages.includes('setoption name UCI_Elo value 1500'));
    assert(workers[0].messages.includes('go movetime 700'));
    const evaluated = await separated.analyze(enginePosition);
    assert.equal(evaluated.score.value, 20);
    assert.equal(evaluated.uci, 'e7e5');
    assert(workers[1].messages.includes('setoption name Skill Level value 20'));
    assert(workers[1].messages.includes('setoption name UCI_LimitStrength value false'));
    assert(!workers[1].messages.some(message=>message.startsWith('setoption name UCI_Elo')));
    assert(workers[1].messages.includes('go depth 18'));
    assert.equal(evaluated.targetReached, true);
    assert.equal(separated.canReuseAnalysisMove(), false);
    separated.setStrength(8);
    assert.equal(workers[0].stopped, false);
    assert.equal(workers[1].stopped, false);
    assert.equal(separated.canReuseAnalysisMove(), true);
    assert.equal(await separated.bestMove(enginePosition), 'e7e5');
    assert.equal(workers.length, 2);
    await separated.analyze(enginePosition);
    assert.equal(workers.length, 2);
    separated.dispose();
    assert(workers.every(worker => worker.stopped));

    let weakenedReplies = 0;
    const practice = createSparringSession({ ...createChapterSparring({headers:{},root:[]}), player:'w', engine:{
        async analyze(state) { return {targetReached:true, score:{type:'cp',value:0},uci:state.turn === 'w' ? 'e2e4' : 'c7c5',pv:[]}; },
        canReuseAnalysisMove: () => false,
        async bestMove() { weakenedReplies++; return 'e7e5'; },dispose() {}
    } });
    await practice.start(); await practice.move('e2e4');
    assert.equal(practice.snapshot().reviews[0].grade, 'best');
    assert.equal(weakenedReplies, 1);
    assert.deepEqual(plain(practice.snapshot().moves), ['e2e4','e7e5']);

    // Retry an earlier decision during live play, preserving first-attempt results.
    const rewindPorts = createChapterSparring({headers:{},root:[]});
    const rewind = createSparringSession({...rewindPorts, player:'w', checkpointEvery:99,
        engine:{
            async analyze(state) { const line=['e2e4','e7e5','g1f3','b8c6']; return {targetReached: true,
                score:{type:'cp',value:0},uci:line[state.moves.length],pv:[line[state.moves.length]].filter(Boolean)}; },
            bestMove:async()=> 'e7e5',cancel(){},dispose(){}
        }});
    await rewind.start();
    await rewind.move('e2e4');
    await rewind.move('g1f3');
    assert.equal(rewind.snapshot().moves.length,4);
    assert.deepEqual(plain(rewind.snapshot().reviews[0].evaluationBefore),{type:'cp',value:0,turn:'w'});
    await rewind.retry(1);
    assert.deepEqual(plain(rewind.snapshot().moves),['e2e4','e7e5']);
    await rewind.retry(0);
    assert.equal(rewind.snapshot().phase,'free');
    assert.equal(rewind.snapshot().moves.length,0);
    assert.equal(rewind.snapshot().canPlay,true);
    await rewind.move('e2e4');
    assert.equal(rewind.snapshot().reviews.at(-1).assisted,true);
    assert.equal(rewind.snapshot().freeCount,2);
    assert.equal(rewind.snapshot().reviews.filter(row=>!row.assisted).length,2);
    rewind.resign();
    await rewind.retry(0);
    assert.equal(rewind.snapshot().phase,'free');

    // Replaying a book move restores its repertoire branches, even after resignation.
    const book = make();
    await book.session.start();
    await book.session.move('e2e4');
    assert.equal(book.session.snapshot().moves.length, 2);
    await book.session.retry(0);
    assert.equal(book.session.snapshot().phase, 'theory');
    assert.deepEqual(plain(book.session.hint().map(move => move.uci)), ['e2e4']);
    await book.session.move('e2e4');
    book.session.resign();
    await book.session.retry(1);
    assert.equal(book.session.snapshot().phase, 'theory');
    assert.equal(book.session.snapshot().canPlay, true);
    assert.equal(book.session.snapshot().moves.length, 2);

    const decisions = [];
    const analyzed = createSparringSession({ ...createChapterSparring({ headers: {}, root: [] }), player: 'w',
        checkpointEvery: 1, onDecision: result => decisions.push(result), engine: {
            async analyze(state) { return { targetReached: true, score: { type: 'cp', value: state.turn === 'w' ? 100 : 0 },
                uci: state.turn === 'w' ? 'd2d4' : 'e7e5', pv: state.turn === 'w' ? ['d2d4', 'd7d5'] : ['e7e5'] }; },
            bestMove() { throw new Error('The analyzed response should be reused'); }, cancel() {}, dispose() {}
        } });
    await analyzed.start();
    await analyzed.move('e2e4');
    assert.equal(analyzed.snapshot().phase, 'review');
    assert.equal(analyzed.snapshot().reason, 'checkpoint');
    assert.equal(analyzed.snapshot().reviews[0].grade, 'inaccuracy');
    assert.deepEqual(plain(analyzed.snapshot().moves), ['e2e4', 'e7e5']);
    assert.equal(decisions.length, 1);
    assert.equal(await analyzed.move('g1f3'), false);
    await analyzed.continueWithEngine();
    assert.equal(analyzed.snapshot().canPlay, true);
    analyzed.analyzeHere();
    await analyzed.retry();
    assert.deepEqual(plain(analyzed.snapshot().moves), []);
    assert.equal(analyzed.snapshot().freeCount, 1);
    await analyzed.move('e2e4');
    assert.equal(analyzed.snapshot().reviews[1].assisted, true);
    assert.equal(analyzed.snapshot().reviews.filter(row => !row.assisted).length, 1);
    assert.equal(analyzed.snapshot().freeCount, 1);
    analyzed.resign();
    assert.equal(analyzed.snapshot().phase, 'finished');
    assert.equal(analyzed.snapshot().reason, 'resigned');
    await analyzed.continueWithEngine();
    assert.equal(analyzed.snapshot().phase, 'finished');

    let searches = 0;
    const blunder = createSparringSession({ ...createChapterSparring({ headers: {}, root: [] }), player: 'w', pauseOnBlunder: true, engine: {
        async analyze(state) { searches++; return { targetReached: true, score: { type: 'cp', value: state.turn === 'w' ? 500 : 0 },
            uci: state.turn === 'w' ? 'd2d4' : 'e7e5', pv: ['d2d4'] }; },
        cancel() {}, dispose() {}
    } });
    await blunder.start(); await blunder.move('e2e4');
    assert.equal(searches, 4);
    assert.equal(blunder.snapshot().reason, 'blunder');
    assert.deepEqual(plain(blunder.snapshot().moves), ['e2e4']);

    // Default play never interrupts for an engine judgement; optional pauses are explicit.
    const continuous = createSparringSession({ ...createChapterSparring({headers:{},root:[]}),player:'w',engine:{
        async analyze(state) { return {targetReached:true, score:{type:'cp',value:state.turn==='w'?500:0},uci:state.turn==='w'?'d2d4':'e7e5',pv:[]}; },
        cancel(){},dispose(){}
    }});
    await continuous.start();await continuous.move('e2e4');
    assert.equal(continuous.snapshot().reviews[0].grade,'blunder');
    assert.equal(continuous.snapshot().phase,'free');
    assert.equal(continuous.snapshot().canPlay,true);
    assert.deepEqual(plain(continuous.snapshot().moves),['e2e4','e7e5']);
    assert.equal(continuous.snapshot().checkpointEvery,0);
    continuous.configure({checkpointEvery:10,pauseOnBlunder:true});
    assert.equal(continuous.snapshot().checkpointEvery,10);
    assert.equal(continuous.snapshot().pauseOnBlunder,true);
    continuous.configure({checkpointEvery:0,pauseOnBlunder:false});
    assert.equal(continuous.snapshot().checkpointEvery,0);
    continuous.dispose();

    let resolveAnalysis;
    let cancelled = false;
    const resignThinking = createSparringSession({ ...createChapterSparring({ headers: {}, root: [] }), player: 'w', engine: {
        analyze() { return new Promise(resolve => { resolveAnalysis = resolve; }); },
        cancel() { cancelled = true; }, dispose() {}
    } });
    await resignThinking.start();
    const analysis = resignThinking.move('e2e4');
    resignThinking.resign();
    resolveAnalysis({ score: { type: 'cp', value: 0 } });
    await analysis;
    assert.equal(cancelled, true);
    assert.equal(resignThinking.snapshot().reason, 'resigned');
    assert.equal(resignThinking.snapshot().reviews.length, 0);
    const tree = moves => moves.length ? [{ move: moves[0], children: tree(moves.slice(1)) }] : [];
    const repertoireStudy = [
        { headers: { ListudyChapterId: 'italian' }, root: tree(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']) },
        { headers: { ListudyChapterId: 'scotch' }, root: tree(['e4', 'e5', 'Nf3', 'Nc6', 'd4']) },
        { headers: { ListudyChapterId: 'queen' }, root: tree(['d4', 'd5', 'c4']) },
        { headers: {}, root: tree(['e4']) }
    ];
    const sourceSnapshot = JSON.stringify(repertoireStudy);
    const studyPorts = createStudySparring(repertoireStudy);
    let engineCalls = 0;
    const wholeStudy = createSparringSession({ ...studyPorts, player: 'w', random: () => 0,
        engine: { async bestMove() { engineCalls++; return 'e5d4'; }, dispose() {} } });
    await wholeStudy.start();
    assert.deepEqual(plain(wholeStudy.hint().map(move => move.uci)), ['e2e4', 'd2d4']);
    await wholeStudy.move('e2e4');
    assert.equal(wholeStudy.snapshot().phase, 'theory'); // A shorter chapter cannot end the union.
    assert.equal(engineCalls, 0);
    await wholeStudy.move('g1f3');
    assert.deepEqual(plain(wholeStudy.hint().map(move => move.uci)), ['f1c4', 'd2d4']);
    assert.equal(engineCalls, 0);
    await wholeStudy.move('d2d4'); // A valid continuation from another chapter.
    assert.equal(wholeStudy.snapshot().phase, 'free');
    assert.equal(engineCalls, 1);
    assert.deepEqual(plain(studyPorts.repertoire.sources()), [{ chapter: 1, path: [0, 0, 0, 0, 0], id: 'scotch' }]);
    assert.equal(JSON.stringify(repertoireStudy), sourceSnapshot);

    const queenPorts = createStudySparring(repertoireStudy);
    const queen = createSparringSession({ ...queenPorts, player: 'b', random: () => 0.99,
        engine: { async bestMove() { throw new Error('Theory remains'); }, dispose() {} } });
    await queen.start();
    assert.deepEqual(plain(queen.snapshot().moves), ['d2d4']);
    await queen.move('d7d5');
    assert.deepEqual(plain(queen.snapshot().moves), ['d2d4', 'd7d5', 'c2c4']);
    assert.equal(queen.snapshot().phase, 'free');

    const duplicates = [
        ...Array.from({ length: 20 }, () => ({ headers: {}, root: tree(['e4', 'e5']) })),
        { headers: {}, root: tree(['e4', 'c5']) }
    ];
    const duplicatesPorts = createStudySparring(duplicates);
    const uniqueReplies = createSparringSession({ ...duplicatesPorts, player: 'w', random: () => 0.75,
        engine: { dispose() {} } });
    await uniqueReplies.start(); await uniqueReplies.move('e2e4');
    assert.deepEqual(plain(uniqueReplies.snapshot().moves), ['e2e4', 'c7c5']);

    const customFen = 'k7/7P/8/8/8/8/8/K7 w - - 0 1';
    const mixed = [
        { headers: { FEN: customFen }, root: tree(['h8=N']) },
        ...repertoireStudy,
        { headers: { FEN: customFen }, root: tree(['h8=Q+']) }
    ];
    const groups = sparringStartPositions(mixed);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].standard, true);
    assert.deepEqual(plain(groups[1].chapters), [0, 5]);
    assert.equal(createStudySparring(mixed).position.snapshot().fen, initial);
    const customPorts = createStudySparring(mixed, { startFen: customFen });
    assert.deepEqual(plain(customPorts.repertoire.choices().map(move => move.uci)), ['h7h8n', 'h7h8q']);
    assert.equal(customPorts.position.snapshot().fen, customFen);
    assert.throws(() => createStudySparring(mixed, { startFen: 'missing' }), /starting position/);
    const blackFen = 'k7/8/8/8/8/8/p7/7K b - - 0 1';
    const blackPosition = createStudySparring([{ headers: { FEN: blackFen }, root: tree(['a1=Q+']) }]);
    assert.equal(blackPosition.position.snapshot().turn, 'b');
    assert.equal(blackPosition.repertoire.choices()[0].uci, 'a2a1q');

    let visited = 0;
    const lazy = createStudySparring([{ headers: {}, root: [
        { move: 'e4', get children() { visited++; return [{ move: 'e5', get children() { throw new Error('Too deep'); } }]; } },
        { move: 'd4', get children() { throw new Error('Unchosen branch visited'); } }
    ] }]);
    assert.equal(visited, 0);
    assert.equal(lazy.repertoire.choices().length, 2);
    assert.equal(visited, 0);
    lazy.repertoire.advance('e2e4'); lazy.position.play('e2e4');
    assert.equal(visited, 1);
    assert.equal(lazy.repertoire.choices()[0].uci, 'e7e5');
    const rotation = createSparringChapterRotation({random: () => 0.37});
    const rotationChapters = [
        {headers: {ListudyChapterId: 'king-pawn'}, root: tree(['e4', 'e5', 'Nf3', 'Nc6'])},
        {headers: {ListudyChapterId: 'petrov'}, root: tree(['e4', 'e5', 'Nf3', 'Nf6'])},
        {headers: {ListudyChapterId: 'sicilian'}, root: tree(['e4', 'c5'])},
        {headers: {ListudyChapterId: 'queen-pawn'}, root: tree(['d4', 'd5'])}
    ];
    const rotationGroup = sparringStartPositions(rotationChapters)[0];
    const cycle = () => Array.from({length: 4}, () => rotation.next(rotationChapters, rotationGroup)[0]);
    const firstCycle = cycle(), secondCycle = cycle();
    assert.equal(new Set(firstCycle).size, 4);
    assert.equal(new Set(secondCycle).size, 4);
    assert.notEqual(firstCycle.at(-1), secondCycle[0]);
    for (const selected of [0, 1]) {
        const ports = createStudySparring(rotationChapters, {chapterOrder: [selected, 2, 3]});
        for (const move of ['e2e4', 'e7e5', 'g1f3']) {
            ports.repertoire.advance(move); ports.position.play(move);
        }
        assert.equal(ports.repertoire.choose(() => 0.99), selected === 0 ? 'b8c6' : 'g8f6', 'The selected chapter must guide later opponent choices');
        assert.equal(ports.repertoire.choices().length, 2, 'Other repertoire continuations remain available');
        ports.position.restore(0); ports.repertoire.restore([]);
        ports.repertoire.advance('d2d4'); ports.position.play('d2d4');
        assert.equal(ports.repertoire.choose(() => 0), 'd7d5', 'A different valid player move adapts the opponent target');
    }
    const customGroup = groups[1];
    const customOrder = rotation.next(mixed, customGroup);
    assert.deepEqual([...plain(customOrder)].sort((a,b) => a-b), [0,5]);
    assert.equal(rotation.next([rotationChapters[0]], {fen: initial, chapters:[0]})[0], 0, 'Changed chapter sets reset the rotation');
    console.log('Shuffled chapter cycles, no cycle-boundary repeat, coherent opponent lines and valid player alternatives passed');
    console.log('Sparring session, evaluation, checkpoints, retries, cancellation and UCI tests passed');
    console.log('Study-wide union, unique choices, chapter provenance, FEN groups and lazy traversal passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
