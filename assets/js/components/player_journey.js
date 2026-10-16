import { readStudyActivity } from '../modules/study_activity.js';

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-study-continue]').forEach(link => {
        const mode = readStudyActivity(link.dataset.studyId);
        if (!mode) return;
        const url = new URL(link.href);
        url.searchParams.set('mode', mode);
        link.href = url.href;
    });

    document.querySelectorAll('[data-endgame-start]').forEach(link => {
        try {
            const solved = JSON.parse(localStorage.getItem('solved_endgames') || '[]');
            if (!Array.isArray(solved)) return;
            const games = JSON.parse(link.dataset.endgameGames);
            const next = games.find(game => !solved.includes(game.id));
            if (next) link.href = next.url;
            if (next && games.some(game => solved.includes(game.id))) link.textContent = link.dataset.continueLabel;
        } catch (_) {}
    });

});
