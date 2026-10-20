function formatPuzzleCounts() {
    const formatter = new Intl.NumberFormat(document.documentElement.lang || navigator.language);
    for (const element of document.querySelectorAll('[data-puzzle-count]')) {
        element.textContent = element.dataset.countLabel.replace('{count}', formatter.format(Number(element.dataset.puzzleCount)));
    }
}
document.addEventListener('DOMContentLoaded', formatPuzzleCounts);
document.addEventListener('phx:update', formatPuzzleCounts);
formatPuzzleCounts();

window.addEventListener('phx:hook:puzzle-filter-error', event => {
    requestAnimationFrame(() => {
        document.getElementById('practice-puzzles')?.elements.namedItem(event.detail.field)?.focus();
    });
});

function rememberPuzzleRating(event) {
    const form = event.target.closest('.puzzle-filters');
    if (!form) return;
    const minimum = form.elements.namedItem('min_rating');
    const maximum = form.elements.namedItem('max_rating');
    if (!minimum || !maximum || minimum.value === '' || maximum.value === '' ||
        !minimum.checkValidity() || !maximum.checkValidity() || Number(minimum.value) > Number(maximum.value)) return;
    try {
        document.cookie = `puzzle_rating=${Number(minimum.value)}:${Number(maximum.value)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    } catch (_) { /* Preferences must not interrupt practice if storage is blocked. */ }
}
document.addEventListener('change', rememberPuzzleRating);
document.addEventListener('submit', rememberPuzzleRating, true);
