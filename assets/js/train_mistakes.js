const Chessground = require('chessground').Chessground;
const Chess = require('chess.js');
const { expectedMoves } = require('./modules/analysis/training_moves');

document.addEventListener('DOMContentLoaded', () => {
    const boardContainer = document.getElementById('chess-training-board');
    if (!boardContainer) return;

    let mistakes = [];
    try {
        mistakes = JSON.parse(boardContainer.getAttribute('data-mistakes') || '[]');
    } catch (error) {
        console.error('Error parsing mistakes data:', error);
    }

    if (mistakes.length === 0) {
        boardContainer.innerHTML = '<p>No mistakes to train in this study.</p>';
        return;
    }

    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    const critical = [];
    const medium = [];
    const low = [];
    mistakes.forEach(mistake => {
        if (mistake.times_repeated >= 5) critical.push(mistake);
        else if (mistake.times_repeated >= 2) medium.push(mistake);
        else low.push(mistake);
    });
    mistakes = [...shuffle(critical), ...shuffle(medium), ...shuffle(low)];

    const chess = new Chess();
    const statusEl = document.getElementById('training-status');
    const infoEl = document.getElementById('mistake-info');
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
        const scale = mistake.times_repeated >= 5 ? 1.4 :
            mistake.times_repeated >= 2 ? 1.15 : 0.85;
        const active = index === currentIndex;

        dot.style.backgroundColor = active ? '#3182ce' :
            mistake.completed ? '#38a169' :
            mistake.times_repeated >= 5 ? '#cbd5e0' : '#e2e8f0';
        dot.style.transform = `scale(${scale * (active ? 1.3 : 1)})`;
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
            dot.setAttribute('aria-label',
                `Position ${index + 1}, missed in ${mistake.times_repeated} game(s)`);
            dot.style.width = '12px';
            dot.style.height = '12px';
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
        infoEl.innerText = `You played ${mistake.played} here in ${mistake.times_repeated} game(s). Find a move from your study.`;
    }

    function loadMistake(index) {
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
        updateDot(previousIndex);
        updateDot(currentIndex);

        if (index >= mistakes.length) {
            statusEl.innerText = 'Training Complete!';
            infoEl.innerText = 'You have reviewed all your mistakes.';
            boardContainer.style.pointerEvents = 'none';
            nextBtn.style.display = 'none';
            if (paginationEl) paginationEl.style.display = 'none';
            return;
        }

        const mistake = mistakes[index];
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

        if (expectedMoves(mistake).includes(move.san)) {
            mistake.completed = true;
            ground.set({ movable: { color: undefined } });
            statusEl.innerText = 'Correct!';
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
            const move = chess.move(expectedMoves(mistakes[currentIndex])[0]);
            if (!move) return;
            chess.undo();
            ground.set({ drawable: { autoShapes: [{ orig: move.from, brush: 'blue' }] } });
        });
    }

    if (solveBtn) {
        solveBtn.addEventListener('click', () => {
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
