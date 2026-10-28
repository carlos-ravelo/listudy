import { readStudyActivity } from '../modules/study/activity.js';

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-study-continue]').forEach(link => {
        const mode = readStudyActivity(link.dataset.studyId);
        if (!mode) return;
        const url = new URL(link.href);
        url.searchParams.set('mode', mode);
        link.href = url.href;
    });

    updateEndgameProgress();
});

function updateEndgameProgress() {
    let solved;
    try {
        const stored = JSON.parse(localStorage.getItem('solved_endgames') || '[]');
        solved = new Set(Array.isArray(stored) ? stored : []);
    } catch (_) { solved = new Set(); }

    document.querySelectorAll('[data-endgame-start]').forEach(link => {
        const games = JSON.parse(link.dataset.endgameGames);
        const next = games.find(game => !solved.has(game.id));
        link.dataset.startLabel ||= link.textContent;
        link.href = (next || games[0]).url;
        link.textContent = next && games.some(game => solved.has(game.id)) ? link.dataset.continueLabel : link.dataset.startLabel;
    });
    document.querySelectorAll('[data-endgame-progress]').forEach(counter => {
        const ids = JSON.parse(counter.dataset.endgameIds);
        const count = ids.filter(id => solved.has(id)).length;
        counter.textContent = counter.dataset.progressTemplate.replace('{solved}', String(count));
        counter.classList.toggle('has-progress', count > 0);
    });
    document.querySelectorAll('[data-endgame-exercise]').forEach(link => {
        const complete = solved.has(link.id);
        link.classList.toggle('is-solved', complete);
        link.setAttribute('aria-label', link.dataset.exerciseLabel + (complete ? ' · ' + link.dataset.solvedLabel : ''));
    });
}

window.addEventListener('pageshow', updateEndgameProgress);
window.addEventListener('storage', event => {
    if (event.key === 'solved_endgames' || event.key === null) updateEndgameProgress();
});
