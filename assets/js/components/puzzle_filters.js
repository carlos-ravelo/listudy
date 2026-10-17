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
