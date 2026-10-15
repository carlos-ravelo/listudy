document.addEventListener('DOMContentLoaded', () => {
    const format = new Intl.DateTimeFormat(document.documentElement.lang || navigator.language, {
        dateStyle: 'medium', timeStyle: 'short'
    });
    document.querySelectorAll('[data-local-time]').forEach(time => {
        const date = new Date(time.dateTime);
        if (!Number.isFinite(date.getTime())) return;
        time.title = time.textContent;
        time.textContent = format.format(date);
    });
    const more = document.querySelector('[data-game-filters-more]');
    if (!more) return;
    document.addEventListener('click', event => { if (!more.contains(event.target)) more.open = false; });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && more.open) {
            more.open = false;
            more.querySelector('summary').focus();
        }
    });
});
