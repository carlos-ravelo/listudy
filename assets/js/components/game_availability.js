document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-new-games-url]').forEach(async card => {
        if (!card.dataset.newGamesUrl) return;
        const status = card.querySelector('[data-new-games-status]');
        const messages = {
            available: 'New games available — sync to update your training targets.',
            current: 'No newer games found.',
            syncing: 'Sync in progress…',
            unavailable: 'Could not check for new games. You can still sync manually.'
        };
        if (card.dataset.syncState === 'running') {
            status.textContent = messages.syncing;
            return;
        }
        try {
            const response = await fetch(card.dataset.newGamesUrl, {
                headers: { Accept: 'application/json' }, credentials: 'same-origin'
            });
            if (!response.ok) throw new Error('Availability check failed');
            const result = await response.json();
            status.textContent = messages[result.status] || messages.unavailable;
            status.classList.toggle('analysis-new-games--available', result.status === 'available');
        } catch (_) {
            status.textContent = messages.unavailable;
        }
    });
});
