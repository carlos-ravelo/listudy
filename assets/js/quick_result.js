import { createGameReplay } from './modules/analysis/game_replay.js';

function setupComparison() {
    const root = document.getElementById('analysis-comparison');
    if (!root) return;
    const board = root.querySelector('#quick-analysis-board');
    const previous = root.querySelector('#btn-prev');
    const next = root.querySelector('#btn-next');
    const jump = root.querySelector('#btn-comparison');
    const status = root.querySelector('#analysis-board-status');
    const choices = Array.from(root.querySelectorAll('[data-select-group]'));
    const matchGroups = Array.from(root.querySelectorAll('[data-match-group]'));
    const chapterLists = matchGroups.map(group => group.querySelector('.analysis-chapter-list'));
    const outcomes = Array.from(root.querySelectorAll('[data-outcome]'));
    const moveList = root.querySelector('#analysis-moves');
    const comparisons = JSON.parse(root.dataset.comparisons);
    let replay;
    try {
        replay = createGameReplay(board, board.dataset.pgn);
    } catch (error) {
        const notice = root.querySelector('#analysis-replay-error');
        notice.textContent = error.message;
        notice.hidden = false;
        board.hidden = true;
    }

    const moveButtons = [];
    function updateNavigation() {
        if (!replay) return;
        previous.disabled = replay.ply === 0;
        next.disabled = replay.ply === replay.moves.length;
        jump.disabled = replay.ply === replay.targetPly;
        status.textContent = replay.status;
        board.setAttribute('aria-label', `Game board: ${replay.status}`);
        moveButtons.forEach((button, ply) => {
            if (ply === replay.ply) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
        });
    }

    function seek(ply) {
        if (!replay) return;
        replay.seek(ply);
        updateNavigation();
    }

    function selectGroup(index, keepChapterListOpen = false) {
        const comparison = comparisons[index];
        if (!comparison) return;
        choices.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.selectGroup) === index)));
        matchGroups.forEach((group, groupIndex) => {
            group.classList.toggle('is-selected', groupIndex === index);
            if (!keepChapterListOpen || groupIndex !== index) chapterLists[groupIndex].open = false;
        });
        outcomes.forEach(panel => { panel.hidden = Number(panel.dataset.outcome) !== index; });
        if (replay) {
            replay.select(comparison.result, comparison.color);
            updateNavigation();
        }
    }

    choices.forEach(button => {
        button.disabled = false;
        button.addEventListener('click', () => selectGroup(Number(button.dataset.selectGroup)));
    });
    chapterLists.forEach((details, index) => {
        details.addEventListener('toggle', () => {
            if (details.open) selectGroup(index, true);
        });
    });

    if (replay) {
        ['Start', ...replay.moves.map(move => move.label)].forEach((label, ply) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', () => seek(ply));
            moveList.appendChild(button);
            moveButtons.push(button);
        });
        previous.addEventListener('click', () => seek(replay.ply - 1));
        next.addEventListener('click', () => seek(replay.ply + 1));
        jump.addEventListener('click', () => seek(replay.targetPly));
        root.querySelectorAll('[data-jump-ply]').forEach(button => {
            button.disabled = false;
            button.addEventListener('click', () => seek(Number(button.dataset.jumpPly)));
        });
        document.addEventListener('keydown', event => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
                event.target.closest('input, textarea, select, [contenteditable], summary, [role="dialog"]')) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                seek(replay.ply + (event.key === 'ArrowRight' ? 1 : -1));
            }
        });
    }
    selectGroup(0);
}

document.addEventListener('DOMContentLoaded', setupComparison);
