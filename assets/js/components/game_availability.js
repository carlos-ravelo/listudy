export function setGameAvailability(card, state) {
    const messages = {
        current: 'No newer games found.',
        syncing: 'Sync in progress…',
        unavailable: 'Could not check for new games. You can still sync manually.',
        disconnected: 'Account disconnected. Reload to connect again.'
    };
    if (state !== 'available' && !messages[state]) state = 'unavailable';
    card.dataset.gameAvailability = state;
    const status = card.querySelector('[data-new-games-status]');
    const button = card.querySelector('.analysis-account-actions button[type="submit"]');
    if (status) {
        status.classList.toggle('analysis-new-games--available', state === 'available');
        status.id ||= `game-availability-${card.dataset.syncPlatform}`;
        if (state === 'available') {
            const title = document.createElement('strong');
            title.textContent = 'New games available';
            const description = document.createElement('span');
            description.textContent = 'Sync to update your training targets.';
            status.replaceChildren(title, description);
        } else status.textContent = messages[state];
        if (button) button.setAttribute('aria-describedby', status.id);
    }
    if (button) {
        button.dataset.syncLabel ||= button.textContent.trim();
        const connected = Boolean(card.dataset.newGamesUrl);
        button.textContent = state === 'syncing' ? (connected ? 'Syncing…' : 'Connecting…') :
            state === 'available' ? 'Sync new games' : button.dataset.syncLabel;
        button.disabled = state === 'syncing';
        if (connected) {
            button.classList.toggle('button-primary', state === 'available');
            button.classList.toggle('button-outline', state !== 'available');
        }
    }
    card.setAttribute('aria-busy', String(state === 'syncing'));
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-new-games-url]').forEach(async card => {
        const form = card.querySelector('.analysis-account-actions');
        form?.addEventListener('submit', () => setGameAvailability(card, 'syncing'));
        if (!card.dataset.newGamesUrl) return;
        if (card.dataset.syncState === 'running') {
            setGameAvailability(card, 'syncing');
            return;
        }
        try {
            const response = await fetch(card.dataset.newGamesUrl, {
                headers: { Accept: 'application/json' }, credentials: 'same-origin'
            });
            if (!response.ok) throw new Error('Availability check failed');
            const result = await response.json();
            if (card.dataset.gameAvailability !== 'syncing') {
                setGameAvailability(card, result.status);
                if (result.status === 'syncing') {
                    card.dataset.syncState = 'running';
                    document.dispatchEvent(new Event('analysis-sync-started'));
                }
            }
        } catch (_) {
            if (card.dataset.gameAvailability !== 'syncing') setGameAvailability(card, 'unavailable');
        }
    });
});
