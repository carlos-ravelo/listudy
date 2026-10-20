import { assessMove } from './evaluation.js';

export function sparringReviewEvery(value) {
    const interval = Number(value);
    return Number.isInteger(interval) && interval >= 0 && interval <= 100 ? interval : 0;
}

// The session owns play and analysis; Listudy supplies its board, hints and progress UI.
export function createSparringSession({ position, repertoire, engine, player, random = Math.random,
    onChange = () => {}, onDecision = () => {}, checkpointEvery = 0, pauseOnBlunder = false }) {
    let phase = 'theory', thinking = false, disposed = false, started = false;
    let feedback = null, error = null, firstDeviation = null, reason = null;
    let attempts = 0, correct = 0, assisted = false, revision = 0, freeCount = 0;
    checkpointEvery = sparringReviewEvery(checkpointEvery);
    let nextCheckpoint = checkpointEvery || Infinity, retryPly = null;
    const moves = [], reviews = [], theoryPlies = [];
    const freeDecisions = new Set();
    const snapshot = () => ({ ...position.snapshot(), phase, thinking, feedback, error, reason,
        theoryPlies: [...theoryPlies], player, firstDeviation, attempts, correct, freeCount, checkpointEvery, pauseOnBlunder, moves: [...moves], reviews: reviews.map(row => ({ ...row })),
        canPlay: started && !disposed && !thinking && !error && ['theory', 'free'].includes(phase) && position.snapshot().turn === player });
    const emit = () => { if (!disposed) onChange(snapshot()); };
    function play(uci) {
        if (!position.play(uci)) throw new Error('Illegal move');
        moves.push(uci);
    }
    function pause(why, finish = false) {
        revision++;
        engine.cancel?.();
        thinking = false; error = null; feedback = null;
        phase = finish ? 'finished' : 'review'; reason = why;
        nextCheckpoint = checkpointEvery ? freeCount + checkpointEvery : Infinity;
        emit();
    }
    async function settle(reply = null) {
        if (disposed || !['theory', 'free'].includes(phase)) return;
        if (position.snapshot().over) { phase = 'finished'; reason = 'gameover'; emit(); return; }
        if (phase === 'theory' && !repertoire.choices().length) phase = 'free';
        if (position.snapshot().turn === player) {
            if (phase === 'free' && freeCount >= nextCheckpoint) pause('checkpoint');
            else emit();
            return;
        }
        const request = revision;
        thinking = true; emit();
        try {
            let uci;
            if (phase === 'theory') {
                const choices = repertoire.choices();
                uci = choices[Math.floor(random() * choices.length)].uci;
            } else uci = reply || await engine.bestMove({ ...position.snapshot(), moves: [...moves] });
            if (disposed || request !== revision) return;
            if (phase === 'theory') repertoire.advance(uci);
            play(uci); assisted = false;
        } catch (_) {
            if (!disposed && request === revision) error = 'opponent';
        } finally {
            if (request === revision) thinking = false;
        }
        if (!disposed && request === revision && !error) await settle();
        else if (request === revision) emit();
    }
    return {
        snapshot,
        configure(options) {
            const interval = sparringReviewEvery(options.checkpointEvery ?? checkpointEvery);
            if (interval !== checkpointEvery) nextCheckpoint = interval ? freeCount + interval : Infinity;
            checkpointEvery = interval;
            pauseOnBlunder = options.pauseOnBlunder ?? pauseOnBlunder;
        },
        async start() { if (started || disposed) return; started = true; await settle(); },
        async move(uci) {
            if (!snapshot().canPlay) return false;
            if (!position.snapshot().legal.includes(uci)) { feedback = 'illegal'; emit(); return false; }
            feedback = null;
            const before = { ...position.snapshot(), moves: [...moves] };
            const ply = moves.length;
            const wasTheory = phase === 'theory';
            if (wasTheory) {
                const valid = repertoire.choices().some(move => move.uci === uci);
                if (!assisted) {
                    attempts++; if (valid) correct++;
                    onDecision({ key: `theory:${ply}`, correct: valid, assisted: false });
                }
                if (!valid) {
                    firstDeviation ||= { fen: before.fen, uci, ply, sources: repertoire.sources?.() };
                    assisted = true; feedback = 'outside'; emit(); return false;
                }
                repertoire.advance(uci);
                feedback = 'correct';
            }
            if (wasTheory) theoryPlies.push(ply);
            play(uci); assisted = false;
            let reply = null;
            if (!wasTheory) {
                const repeated = freeDecisions.has(ply);
                if (!freeDecisions.has(ply)) { freeDecisions.add(ply); freeCount++; }
                const request = revision;
                thinking = true; emit();
                try {
                    if (engine.analyze) {
                        let first = await engine.analyze(before, { targetDepth: 18, maxTimeMs: 4000 });
                        if (disposed || request !== revision) return false;
                        const after = { ...position.snapshot(), moves: [...moves] };
                        let last = after.over ? { targetReached: true, score: after.result === '1/2-1/2' ? { type: 'cp', value: 0 } : { type: 'mate', value: 0 } }
                            : await engine.analyze(after, { targetDepth: 18, maxTimeMs: 4000 });
                        if (disposed || request !== revision) return false;
                        const assess = () => first.targetReached === true && last.targetReached === true ? assessMove({ ...first, turn: before.turn }, { ...last, turn: after.turn }, player, uci) : null;
                        let assessment = assess();
                        if (['inaccuracy', 'mistake', 'blunder'].includes(assessment?.grade) && !after.over) {
                            const initialGrade = assessment.grade;
                            last = await engine.analyze(after, { targetDepth: 20, maxTimeMs: 4000 });
                            if (disposed || request !== revision) return false;
                            first = await engine.analyze(before, { targetDepth: 20, maxTimeMs: 4000 });
                            if (disposed || request !== revision) return false;
                            assessment = assess();
                            if (assessment?.grade !== initialGrade) assessment = null;
                        }
                        reply = engine.canReuseAnalysisMove?.() === false ? null : last.uci;
                        if (assessment) {
                            const retried = repeated || retryPly === ply;
                            reviews.push({ ...assessment, ply, uci, positionKey: before.moves.join(' '), san: position.snapshot().lastMove?.san || uci,
                                best: first.uci, pv: first.pv || [], assisted: retried,
                                analysisDepthBefore: first.depth, analysisDepthAfter: last.depth,
                                evaluationBefore: { ...first.score, turn: before.turn },
                                evaluationAfter: { ...last.score, turn: after.turn } });
                            onDecision({ key: `free:${ply}`, correct: ['best', 'acceptable'].includes(assessment.grade), assisted: retried });
                            if (pauseOnBlunder && assessment.grade === 'blunder' && !position.snapshot().over) { pause('blunder'); return true; }
                        }
                    } else onDecision({ key: `free:${ply}`, correct: false, assisted: false });
                } catch (_) {
                    if (!disposed && request === revision) error = 'analysis';
                } finally {
                    if (request === revision) thinking = false;
                }
                if (disposed || request !== revision) return false;
                if (error) { emit(); return true; }
            }
            await settle(reply);
            return true;
        },
        hint() {
            if (!snapshot().canPlay || phase !== 'theory') return [];
            assisted = true; feedback = 'hint'; emit();
            return repertoire.choices().map(move => ({ ...move }));
        },
        async continueWithEngine() {
            if (!started || disposed || thinking || phase === 'finished') return;
            phase = 'free'; reason = null; feedback = null; error = null;
            await settle();
        },
        analyzeHere() { if (!disposed && started && !thinking && phase !== 'finished') pause('manual'); },
        resign() { if (!disposed && started && phase !== 'finished') pause('resigned', true); },
        async retry(ply = reviews[reviews.length - 1]?.ply) {
            if (!started || disposed || thinking || !Number.isInteger(ply) || ply < 0 || ply >= moves.length || !position.restore) return;
            revision++; engine.cancel?.();
            position.restore(ply); moves.splice(ply);
            repertoire.restore?.(moves);
            while (theoryPlies.length && theoryPlies[theoryPlies.length - 1] >= ply) theoryPlies.pop();
            retryPly = ply;
            assisted = true;
            nextCheckpoint = checkpointEvery ? freeCount + checkpointEvery : Infinity;
            phase = repertoire.restore && repertoire.choices().length ? 'theory' : 'free';
            reason = null; feedback = null; error = null; emit();
            await settle();
        },
        dispose() { disposed = true; revision++; engine.dispose(); }
    };
}
