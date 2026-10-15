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

    let mistakes = [];
    try {
        mistakes = JSON.parse(boardContainer.getAttribute('data-mistakes') || '[]');
    } catch (error) {
        console.error('Error parsing mistakes data:', error);
    }

    const progressStatus = document.getElementById('training-progress-status');
    const key = boardContainer.dataset.studyKey + '_chapter_stats';
    const controls = document.getElementById('training-controls');
    controls.hidden = true;
    let online = await StorageAdapter.hydrate();
    let stats = readChapterStats(StorageAdapter.getItem(key));
    const originalTotal = mistakes.length;
    let signatures, references;
    try {
        const parsed = require('pgn-parser').parse(boardContainer.dataset.studyPgn.replace(/\ufeff/g, '').replace(/½/g, '1/2').replace(/0-0/g, 'O-O'));
        annotate_pgn(parsed);
        const trees = generate_move_trees(parsed);
        signatures = trees.map(tree => chapterReviewSignature(tree.root, tree.headers.FEN));
        const catalog = positionCatalog(trees, boardContainer.dataset.studyColor)
            .map(item => ({ ...item, sourceIndex: trees[item.chapter].sourceIndex }));
        bindChapterIdentities(stats, trees);
        reconcileStudyProgress(stats, trees, catalog, signatures, [], boardContainer.dataset.studyColor);
        ({ references } = applyGameEvidence(stats, signatures, catalog, mistakes));
        mistakes = mistakes.filter(mistake => references.has(mistake));
        mistakes.sort((a, b) => Number(gamePositionPending(stats, b)) - Number(gamePositionPending(stats, a)) ||
            b.times_repeated - a.times_repeated || new Date(b.last_played_at) - new Date(a.last_played_at));
    } catch (_) {
        progressStatus.textContent = 'This study could not be loaded. Open the study or sync games and try again.';
        boardContainer.hidden = true;
        return;
    }
    const persist = () => StorageAdapter.setItem(key, JSON.stringify(stats));
    persist();
    window.addEventListener('study-progress-sync-merged', event => {
        if (event.detail.key === key) { stats = JSON.parse(event.detail.value); renderProgress(); }
    });
    window.addEventListener('study-sync-status', event => {
        online = event.detail.state === 'saved';
        renderProgress();
    });
    const renderProgress = () => {
        if (!mistakes.length) {
            progressStatus.textContent = 'No current positions to practice. Sync games after editing a study to refresh its comparisons.';
            return;
        }
        const pending = mistakes.filter(mistake => gamePositionPending(stats, mistake)).length;
        progressStatus.textContent = `${mistakes.length} ${mistakes.length === 1 ? 'position' : 'positions'} from games · ${pending} to review now. ` +
            (online ? 'Progress syncs with your account.' : 'Saved on this device; account sync will retry.') +
            (originalTotal > mistakes.length ? ` ${originalTotal - mistakes.length} changed positions skipped; sync games to refresh them.` : '');
    };
    renderProgress();
    if (!mistakes.length) {
        boardContainer.hidden = true;
        progressStatus.textContent = 'No current positions to practice. Sync games after editing a study to refresh its comparisons.';
        return;
    }
    controls.hidden = false;
    let attempted = new Set();
    let assisted = false;
    const tracker = createPracticeTracker({ save(record) {
        stats.studySessions = { ...stats.studySessions, [record.id]: record };
        persist();
    }});
    const eligible = () => !document.hidden && document.hasFocus() && currentIndex < mistakes.length;
    const activity = () => tracker.activity(Date.now(), eligible());
    document.addEventListener('pointerdown', activity, true);
    document.addEventListener('keydown', activity, true);
    document.addEventListener('visibilitychange', () => { tracker.tick(Date.now(), eligible()); tracker.persist(); });
    window.addEventListener('blur', () => { tracker.tick(Date.now(), false); tracker.persist(); });
    window.addEventListener('focus', activity);
    window.addEventListener('pagehide', () => { tracker.end('left'); StorageAdapter.forceSyncAll(); });
    setInterval(() => { tracker.tick(Date.now(), eligible()); tracker.persist(); }, 15000);
    const grade = (san, correct) => {
        const item = references.get(mistakes[currentIndex]);
        const first = recordGamePractice(stats, signatures, item, san, correct, assisted || attempted.has(item.id), attempted);
        if (first) tracker.decision(`${item.chapter}|${item.id}`, false, correct, assisted);
        persist();
        renderProgress();
    };

    const chess = new Chess();
    const statusEl = document.getElementById('training-status');
    const infoEl = document.getElementById('mistake-info');
    const chaptersEl = document.getElementById('training-chapters');
    const nextBtn = document.getElementById('next-mistake-btn');
    const paginationEl = document.getElementById('mistakes-pagination');
    const hintBtn = document.getElementById('hint-btn');
    const solveBtn = document.getElementById('solve-btn');
    const dots = [];
    let currentIndex = -1;
    let ground;
    let resetTimer;

    function updateDot(index) {
        const dot = dots[index];
        if (!dot) return;

        const mistake = mistakes[index];
        const active = index === currentIndex;
        dot.hidden = Math.abs(index - currentIndex) > 2 && index !== 0 && index !== mistakes.length - 1;

        dot.style.backgroundColor = active ? '#3182ce' :
            mistake.completed ? '#38a169' :
            mistake.reviewed ? '#d69e2e' :
            mistake.times_repeated >= 5 ? '#cbd5e0' : '#e2e8f0';
        dot.style.color = '#202530';
        dot.style.boxShadow = active ? '0 0 6px rgba(49, 130, 206, 0.4)' : '';
        if (active) dot.setAttribute('aria-current', 'step');
        else dot.removeAttribute('aria-current');
    }

    function createDots() {
        if (!paginationEl) return;
        paginationEl.style.alignItems = 'center';
        paginationEl.style.gap = '12px';
        const fragment = document.createDocumentFragment();

        mistakes.forEach((mistake, index) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.textContent = String(index + 1);
            dot.setAttribute('aria-label',
                `Position ${index + 1}, missed in ${mistake.times_repeated} game(s)`);
            dot.style.width = '32px';
            dot.style.height = '32px';
            dot.style.padding = '0';
            dot.style.border = '0';
            dot.style.borderRadius = '50%';
            dot.style.cursor = 'pointer';
            dot.style.transition = 'background-color 0.2s ease, transform 0.2s ease';
            dot.addEventListener('click', () => loadMistake(index));
            dots.push(dot);
            fragment.appendChild(dot);
            updateDot(index);
        });
        paginationEl.appendChild(fragment);
    }

    function getLegalMoves() {
        const dests = new Map();
        chess.SQUARES.forEach(square => {
            const moves = chess.moves({ square, verbose: true });
            if (moves.length) dests.set(square, moves.map(move => move.to));
        });
        return dests;
    }

    function getTurnColor() {
        return chess.turn() === 'w' ? 'white' : 'black';
    }

    function showPrompt(mistake) {
        infoEl.innerText = `Outside your repertoire in ${mistake.times_repeated} game(s), for example ${mistake.played}. Find a move from your study.`;
    }

    function showChapters(mistake) {
        if (!chaptersEl) return;
        chaptersEl.replaceChildren();
        const hasLookup = Array.isArray(mistake.chapters);
        const chapters = hasLookup ? [...mistake.chapters].sort((a, b) =>
            Number(b.number === references.get(mistake).sourceIndex + 1) - Number(a.number === references.get(mistake).sourceIndex + 1)) : [];
        chaptersEl.hidden = !hasLookup;
        if (!hasLookup) return;
        if (chapters.length === 0) {
            chaptersEl.textContent = 'No matching chapter in the current study.';
            return;
        }

        function makeLink(chapter) {
            const link = document.createElement('a');
            link.href = chapter.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = `Chapter ${chapter.number}: ${chapter.name} ↗`;
            return link;
        }

        const practice = document.createElement('a');
        const chapter = chapters[0];
        if (chapter) {
            const url = new URL(chapter.url, window.location.origin);
            url.searchParams.set('practice_fen', mistake.fen);
            url.searchParams.set('practice_expected', mistake.expected);
            practice.href = url.pathname + url.search;
            practice.textContent = 'Practice this line';
            chaptersEl.appendChild(practice);
        }

        if (chapters.length === 1) {
            chaptersEl.appendChild(makeLink(chapters[0]));
        } else {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = `Study this position · ${chapters.length} chapters`;
            const list = document.createElement('ul');
            chapters.forEach(chapter => {
                const item = document.createElement('li');
                item.appendChild(makeLink(chapter));
                list.appendChild(item);
            });
            details.append(summary, list);
            chaptersEl.appendChild(details);
        }
    }

    function loadMistake(index) {
        if (currentIndex >= 0 && currentIndex < mistakes.length) {
            finishChapterPractice(stats, references.get(mistakes[currentIndex]).chapter, false);
            persist();
        }
        if (resetTimer) {
            clearTimeout(resetTimer);
            resetTimer = undefined;
        }
        if (ground) {
            ground.destroy();
            ground = undefined;
        }

        const previousIndex = currentIndex;
        currentIndex = index;
        dots.forEach((_, index) => updateDot(index));

        if (index >= mistakes.length) {
            tracker.end('completed');
            statusEl.innerText = 'Session complete';
            infoEl.innerText = 'Practice saved. Your next reviews follow the same schedule as Smart; past game deviations remain in your history.';
            statusEl.focus();
            boardContainer.style.pointerEvents = 'none';
            nextBtn.style.display = 'none';
            hintBtn.hidden = true;
            solveBtn.hidden = true;
            if (paginationEl) paginationEl.style.display = 'none';
            if (chaptersEl) {
                chaptersEl.replaceChildren();
                chaptersEl.hidden = true;
            }
            return;
        }

        const mistake = mistakes[index];
        attempted = new Set();
        assisted = false;
        beginChapterPractice(stats, references.get(mistake).chapter, signatures[references.get(mistake).chapter]);
        tracker.begin('positions');
        boardContainer.style.pointerEvents = '';
        chess.load(mistake.fen);
        const turnColor = getTurnColor();

        boardContainer.innerHTML = '';
        ground = Chessground(boardContainer, {
            fen: mistake.fen,
            turnColor,
            orientation: turnColor,
            movable: {
                color: turnColor,
                free: false,
                dests: getLegalMoves(),
                events: { after: onMove }
            }
        });
        statusEl.innerText = `Position ${index + 1} of ${mistakes.length}`;
        statusEl.style.color = 'inherit';
        showPrompt(mistake);
        showChapters(mistake);
        nextBtn.style.display = 'none';
        if (hintBtn) {
            hintBtn.style.display = 'inline-block';
            hintBtn.disabled = false;
        }
        if (solveBtn) {
            solveBtn.style.display = 'inline-block';
            solveBtn.disabled = false;
        }
    }

    function onMove(orig, dest) {
        const mistake = mistakes[currentIndex];
        const move = chess.move({ from: orig, to: dest, promotion: 'q' });
        if (!move) return;

        const cleanRecall = !assisted && !attempted.has(references.get(mistake).id);
        grade(move.san, expectedMoves(mistake).includes(move.san));
        if (expectedMoves(mistake).includes(move.san)) {
            mistake.completed = cleanRecall;
            mistake.reviewed = true;
            ground.set({ movable: { color: undefined } });
            statusEl.innerText = cleanRecall ? 'Correct!' : 'Correct — another review is scheduled';
            statusEl.style.color = '#15781B';
            infoEl.innerText = `Yes, ${move.san} is in your study.`;
            nextBtn.style.display = 'block';
            if (hintBtn) hintBtn.style.display = 'none';
            if (solveBtn) solveBtn.style.display = 'none';
            updateDot(currentIndex);
        } else {
            ground.set({ movable: { color: undefined } });
            statusEl.innerText = 'Incorrect!';
            statusEl.style.color = '#e53e3e';
            infoEl.innerText = `You tried ${move.san}. Try again!`;
            if (hintBtn) hintBtn.disabled = true;
            if (solveBtn) solveBtn.disabled = true;

            resetTimer = setTimeout(() => {
                resetTimer = undefined;
                chess.undo();
                const turnColor = getTurnColor();
                ground.set({
                    fen: chess.fen(),
                    turnColor,
                    movable: {
                        color: turnColor,
                        free: false,
                        dests: getLegalMoves(),
                        events: { after: onMove }
                    }
                });
                statusEl.innerText = `Position ${currentIndex + 1} of ${mistakes.length}`;
                statusEl.style.color = 'inherit';
                showPrompt(mistake);
                if (hintBtn) hintBtn.disabled = false;
                if (solveBtn) solveBtn.disabled = false;
            }, 500);
        }
    }

    nextBtn.addEventListener('click', () => loadMistake(currentIndex + 1));

    if (hintBtn) {
        hintBtn.addEventListener('click', () => {
            assisted = true;
            const move = chess.move(expectedMoves(mistakes[currentIndex])[0]);
            if (!move) return;
            chess.undo();
            ground.set({ drawable: { autoShapes: [{ orig: move.from, brush: 'blue' }] } });
        });
    }

    if (solveBtn) {
        solveBtn.addEventListener('click', () => {
            assisted = true;
            grade(expectedMoves(mistakes[currentIndex])[0], false);
            mistakes[currentIndex].reviewed = true;
            updateDot(currentIndex);
            const move = chess.move(expectedMoves(mistakes[currentIndex])[0]);
            if (!move) return;
            ground.move(move.from, move.to);
            ground.set({ movable: { color: undefined } });
            statusEl.innerText = 'Solution shown';
            statusEl.style.color = '#d69e2e';
            infoEl.innerText = `One move from your study was ${move.san}.`;
            if (hintBtn) hintBtn.style.display = 'none';
            solveBtn.style.display = 'none';
            nextBtn.style.display = 'inline-block';
        });
    }

    createDots();
    loadMistake(0);

    const timeFilter = document.getElementById('time-filter');
    if (timeFilter) {
        timeFilter.addEventListener('change', event => {
            window.location.href = window.location.pathname + '?filter=' + event.target.value;
        });
    }
});
