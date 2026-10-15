const Chessground = require('chessground').Chessground;
const Chess = require('chess.js');
const { expectedMoves } = require('./modules/analysis/training_moves');
import { StorageAdapter } from './storageAdapter.js';
import { generate_move_trees, annotate_pgn } from './modules/tree_from_pgn.js';
import { readChapterStats, bindChapterIdentities, beginChapterPractice, finishChapterPractice } from './modules/study/chapter_stats.js';
import { chapterReviewSignature } from './modules/study/chapter_review.js';
import { positionCatalog } from './modules/study/position_review.js';
import { reconcileStudyProgress } from './modules/study/progress_preservation.js';
import { createPracticeTracker } from './modules/study/practice_sessions.js';
import { applyGameEvidence, gamePositionPending, recordGamePractice } from './modules/analysis/game_progress.js';

document.addEventListener('DOMContentLoaded', async () => {
    const boardContainer = document.getElementById('chess-training-board');
    if (!boardContainer) return;
    const el = id => document.getElementById(id);
    const controls = el('training-controls');
    const progressStatus = el('training-progress-status');
    const scope = el('training-scope');
    const statusEl = el('training-status');
    const infoEl = el('mistake-info');
    const counter = el('training-position-counter');
    const chaptersEl = el('training-chapters');
    const nextBtn = el('next-mistake-btn');
    const skipBtn = el('skip-mistake-btn');
    const hintBtn = el('hint-btn');
    const solveBtn = el('solve-btn');
    const finishBtn = el('finish-training-btn');
    const pagination = el('mistakes-pagination');
    const key = boardContainer.dataset.studyKey + '_chapter_stats';
    let source = [];
    try { source = JSON.parse(boardContainer.dataset.mistakes || '[]'); } catch (_) {}
    let online = await StorageAdapter.hydrate();
    let stats = readChapterStats(StorageAdapter.getItem(key));
    let signatures, references, positions;
    const positionKey = mistake => {
        const item = references.get(mistake);
        return `${item.chapter}|${item.id}`;
    };
    try {
        const parsed = require('pgn-parser').parse(boardContainer.dataset.studyPgn.replace(/\ufeff/g, '').replace(/½/g, '1/2').replace(/0-0/g, 'O-O'));
        annotate_pgn(parsed);
        const trees = generate_move_trees(parsed);
        signatures = trees.map(tree => chapterReviewSignature(tree.root, tree.headers.FEN));
        const catalog = positionCatalog(trees, boardContainer.dataset.studyColor)
            .map(item => ({ ...item, sourceIndex: trees[item.chapter].sourceIndex }));
        bindChapterIdentities(stats, trees);
        reconcileStudyProgress(stats, trees, catalog, signatures, [], boardContainer.dataset.studyColor);
        ({ references } = applyGameEvidence(stats, signatures, catalog, source));
        const seen = new Set();
        positions = source.filter(mistake => {
            if (!references.has(mistake) || seen.has(positionKey(mistake))) return false;
            seen.add(positionKey(mistake));
            return true;
        });
        positions.sort((a, b) => Number(gamePositionPending(stats, b)) - Number(gamePositionPending(stats, a)) ||
            b.times_repeated - a.times_repeated || new Date(b.last_played_at) - new Date(a.last_played_at));
    } catch (_) {
        progressStatus.textContent = 'This study could not be loaded. Open the study or sync games and try again.';
        return;
    }
    const persist = () => StorageAdapter.setItem(key, JSON.stringify(stats));
    const renderProgress = () => {
        const pending = positions.filter(mistake => gamePositionPending(stats, mistake)).length;
        progressStatus.textContent = `${pending} to review now · ${positions.length} ${positions.length === 1 ? 'position' : 'positions'} from games`;
        const sync = el('training-sync-status');
        sync.hidden = online;
        sync.textContent = 'Saved on this device. Account sync will retry when connected.';
        if (source.length > positions.length) progressStatus.textContent += ` · ${source.length - positions.length} changed positions skipped; sync games to refresh`;
    };
    window.addEventListener('study-progress-sync-merged', event => {
        if (event.detail.key === key) { stats = JSON.parse(event.detail.value); renderProgress(); }
    });
    window.addEventListener('study-sync-status', event => { online = event.detail.state === 'saved'; renderProgress(); });
    persist();
    renderProgress();

    let queue = [], currentIndex = -1, sessionOpen = false;
    let results = new Map(), attempts = new Map(), solved = new Set();
    let assisted = false, ground, resetTimer;
    const chess = new Chess();
    const tracker = createPracticeTracker({ save(record) {
        stats.studySessions = { ...stats.studySessions, [record.id]: record };
        persist();
    }});
    const eligible = () => sessionOpen && !document.hidden && document.hasFocus();
    const activity = () => tracker.activity(Date.now(), eligible());
    document.addEventListener('pointerdown', activity, true);
    document.addEventListener('keydown', activity, true);
    document.addEventListener('visibilitychange', () => { tracker.tick(Date.now(), eligible()); tracker.persist(); });
    window.addEventListener('blur', () => { tracker.tick(Date.now(), false); tracker.persist(); });
    window.addEventListener('focus', activity);
    window.addEventListener('pagehide', () => { finishCurrentPractice(); tracker.end('left'); StorageAdapter.forceSyncAll(); });
    setInterval(() => { tracker.tick(Date.now(), eligible()); tracker.persist(); }, 15000);

    function feedback(state, title, text) {
        statusEl.dataset.feedback = state;
        statusEl.textContent = title;
        infoEl.textContent = text;
    }
    function clearBoard() {
        clearTimeout(resetTimer);
        resetTimer = undefined;
        ground?.destroy();
        ground = undefined;
        boardContainer.replaceChildren();
    }
    function finishCurrentPractice() {
        if (!sessionOpen || !queue[currentIndex]) return;
        finishChapterPractice(stats, references.get(queue[currentIndex]).chapter, false);
        persist();
    }
    function updateButtons() {
        const done = solved.has(positionKey(queue[currentIndex]));
        hintBtn.hidden = solveBtn.hidden = done;
        nextBtn.hidden = !done;
        skipBtn.hidden = done;
        finishBtn.hidden = done && currentIndex === queue.length - 1;
        nextBtn.textContent = currentIndex === queue.length - 1 ? 'Finish session' : 'Next position';
        hintBtn.disabled = solveBtn.disabled = skipBtn.disabled = Boolean(resetTimer);
    }
    function renderDots() {
        [...pagination.children].forEach((button, index) => {
            const value = results.get(positionKey(queue[index]));
            const state = value === undefined ? 'Not attempted' : value ? 'Recalled without help' : 'Needs another review';
            button.hidden = Math.abs(index - currentIndex) > 2 && index !== 0 && index !== queue.length - 1;
            button.dataset.result = value === undefined ? 'unseen' : value ? 'clean' : 'assisted';
            button.setAttribute('aria-label', `Position ${index + 1}: ${state}`);
            if (index === currentIndex) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
        });
    }
    function createDots() {
        pagination.replaceChildren();
        queue.forEach((_, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = String(index + 1);
            button.addEventListener('click', () => loadMistake(index, true));
            pagination.appendChild(button);
        });
    }
    function showChapters(mistake) {
        chaptersEl.replaceChildren();
        const chapters = [...(mistake.chapters || [])].sort((a, b) =>
            Number(b.number === references.get(mistake).sourceIndex + 1) - Number(a.number === references.get(mistake).sourceIndex + 1));
        chaptersEl.hidden = chapters.length === 0;
        if (!chapters.length) return;
        const url = new URL(chapters[0].url, window.location.origin);
        url.searchParams.set('practice_fen', mistake.fen);
        url.searchParams.set('practice_expected', mistake.expected);
        const practice = document.createElement('a');
        practice.href = url.pathname + url.search;
        practice.textContent = 'Practice this line';
        chaptersEl.appendChild(practice);
        const makeLink = chapter => {
            const link = document.createElement('a');
            link.href = chapter.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = `${chapter.name} ↗`;
            return link;
        };
        if (chapters.length === 1) chaptersEl.appendChild(makeLink(chapters[0]));
        else {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = `${chapters.length} matching chapters`;
            const list = document.createElement('ul');
            chapters.forEach(chapter => { const li = document.createElement('li'); li.appendChild(makeLink(chapter)); list.appendChild(li); });
            details.append(summary, list);
            chaptersEl.appendChild(details);
        }
    }
    function legalMoves() {
        const dests = new Map();
        chess.SQUARES.forEach(square => {
            const moves = chess.moves({ square, verbose: true });
            if (moves.length) dests.set(square, moves.map(move => move.to));
        });
        return dests;
    }
    function loadMistake(index, focus = false) {
        finishCurrentPractice();
        clearBoard();
        if (index >= queue.length) { endSession(); return; }
        currentIndex = index;
        const mistake = queue[index];
        const item = references.get(mistake);
        const id = positionKey(mistake);
        assisted = attempts.get(id)?.has(item.id) || false;
        beginChapterPractice(stats, item.chapter, signatures[item.chapter]);
        chess.load(mistake.fen);
        const color = chess.turn() === 'w' ? 'white' : 'black';
        ground = Chessground(boardContainer, { fen: mistake.fen, turnColor: color, orientation: color,
            movable: { color: solved.has(id) ? undefined : color, free: false, dests: legalMoves(), events: { after: onMove } } });
        counter.textContent = `Position ${index + 1} of ${queue.length}`;
        const explanation = `Outside your repertoire in ${mistake.times_repeated} ${mistake.times_repeated === 1 ? 'game' : 'games'}, for example ${mistake.played}.`;
        feedback('neutral', solved.has(id) ? 'Already practiced' : 'Your move', explanation);
        showChapters(mistake);
        updateButtons(); renderDots();
        if (focus) counter.focus();
    }
    function grade(san, correct) {
        const mistake = queue[currentIndex];
        const item = references.get(mistake);
        const id = positionKey(mistake);
        const attempted = attempts.get(id) || new Set();
        attempts.set(id, attempted);
        const first = recordGamePractice(stats, signatures, item, san, correct, assisted || attempted.has(item.id), attempted);
        if (first) {
            results.set(id, correct && !assisted);
            tracker.decision(id, false, correct, assisted);
        }
        persist(); renderProgress(); renderDots();
    }
    function onMove(orig, dest) {
        if (!sessionOpen || resetTimer || solved.has(positionKey(queue[currentIndex]))) return;
        const mistake = queue[currentIndex];
        const move = chess.move({ from: orig, to: dest, promotion: 'q' });
        if (!move) return;
        const item = references.get(mistake);
        const id = positionKey(mistake);
        const clean = !assisted && !attempts.get(id)?.has(item.id);
        const correct = expectedMoves(mistake).includes(move.san);
        grade(move.san, correct);
        ground.set({ movable: { color: undefined } });
        if (correct) {
            solved.add(id);
            feedback(clean ? 'success' : 'assisted', clean ? 'Correct!' : 'Correct — another review is scheduled', `${move.san} is in your repertoire.`);
            updateButtons();
        } else {
            assisted = true;
            feedback('error', 'Try again', `You tried ${move.san}. Find a move from your repertoire.`);
            resetTimer = setTimeout(() => {
                resetTimer = undefined;
                chess.undo();
                ground.set({ fen: chess.fen(), turnColor: chess.turn() === 'w' ? 'white' : 'black',
                    movable: { color: chess.turn() === 'w' ? 'white' : 'black', free: false, dests: legalMoves(), events: { after: onMove } } });
                updateButtons();
            }, 500);
            updateButtons();
        }
    }
    function updateUrl() {
        const url = new URL(window.location.href);
        if (scope.value === 'all') url.searchParams.set('scope', 'all'); else url.searchParams.delete('scope');
        history.replaceState(null, '', url);
    }
    function startQueue(items, focus = false) {
        finishCurrentPractice(); clearBoard(); tracker.end('stopped');
        queue = items; currentIndex = -1; results = new Map(); attempts = new Map(); solved = new Set();
        sessionOpen = queue.length > 0;
        el('training-summary').hidden = true;
        el('training-empty').hidden = sessionOpen;
        controls.hidden = boardContainer.hidden = counter.hidden = !sessionOpen;
        if (!sessionOpen) {
            el('training-empty-title').textContent = positions.length ? "You're up to date" : 'No current positions to practice';
            el('training-empty-description').textContent = positions.length
                ? 'Your game positions will return when their next review is due. You can also practice them freely.'
                : 'Sync games after editing a study to refresh its comparisons.';
            el('training-empty').querySelector('[data-review-all]').hidden = !positions.length;
            return;
        }
        createDots(); tracker.begin('positions'); loadMistake(0, focus);
    }
    function selectScope(focus = false) {
        updateUrl();
        startQueue(scope.value === 'all' ? positions : positions.filter(mistake => gamePositionPending(stats, mistake)), focus);
    }
    function endSession() {
        finishCurrentPractice(); clearBoard(); sessionOpen = false;
        const clean = [...results.values()].filter(Boolean).length;
        const unattempted = queue.length - results.size;
        tracker.end(unattempted ? 'stopped' : 'completed');
        controls.hidden = boardContainer.hidden = counter.hidden = true;
        el('training-summary').hidden = false;
        el('training-summary-title').textContent = unattempted ? 'Session saved' : 'Session complete';
        el('training-summary-result').textContent = `${results.size} practiced · ${clean} recalled without help · ${results.size - clean} need another review · ${unattempted} not attempted`;
        const seconds = Math.floor((tracker.current?.activeMs || 0) / 1000);
        el('training-summary-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} active practice`;
        el('training-remaining').hidden = unattempted === 0;
        el('training-summary-title').focus();
        StorageAdapter.forceSyncAll();
    }
    nextBtn.onclick = skipBtn.onclick = () => loadMistake(currentIndex + 1, true);
    finishBtn.onclick = endSession;
    hintBtn.onclick = () => {
        assisted = true;
        const move = chess.move(expectedMoves(queue[currentIndex])[0]);
        if (!move) return;
        chess.undo();
        ground.set({ drawable: { autoShapes: [{ orig: move.from, brush: 'blue' }] } });
        feedback('assisted', 'Hint shown', 'The marked piece can play a move from your repertoire.');
    };
    solveBtn.onclick = () => {
        assisted = true;
        const san = expectedMoves(queue[currentIndex])[0];
        grade(san, false);
        const move = chess.move(san);
        if (!move) return;
        solved.add(positionKey(queue[currentIndex]));
        ground.move(move.from, move.to);
        ground.set({ movable: { color: undefined } });
        feedback('assisted', 'Solution shown', `${move.san} is one move from your repertoire.`);
        updateButtons(); nextBtn.focus();
    };
    el('training-remaining').onclick = () => startQueue(queue.filter(mistake => !results.has(positionKey(mistake))), true);
    document.querySelectorAll('[data-review-all]').forEach(button => button.onclick = () => { scope.value = 'all'; selectScope(true); });
    scope.value = new URLSearchParams(window.location.search).get('scope') === 'all' ? 'all' : 'due';
    scope.disabled = false;
    scope.onchange = () => selectScope(true);
    el('time-filter').onchange = event => {
        const url = new URL(window.location.href);
        url.searchParams.set('filter', event.target.value);
        window.location.href = url.pathname + url.search;
    };
    const about = document.querySelector('.training-about');
    document.addEventListener('click', event => { if (!about.contains(event.target)) about.open = false; });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && about.open) { about.open = false; about.querySelector('summary').focus(); }
    });
    selectScope();
});
