import "./components/analysis_repertoires.js";
import "./components/game_availability.js";
const Chess = require('chess.js');

document.addEventListener("DOMContentLoaded", () => {
    const timeFilter = document.getElementById("time-filter");
    if (timeFilter) {
        timeFilter.addEventListener("change", (e) => {
            window.location.href = window.location.pathname + '?filter=' + e.target.value;
        });
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const pgnTextarea = document.querySelector("textarea[name='pgn']");

    if (pgnTextarea) {
        const form = pgnTextarea.closest("form");

        if (form) {
            form.addEventListener("submit", (e) => {
                const pgnText = pgnTextarea.value.trim();

                if (pgnText === "") {
                    e.preventDefault();
                    alert("The PGN cannot be empty.");
                    return;
                }

                try {
                    const chess = new Chess();
                    const isValidPgn = typeof chess.load_pgn === 'function' 
                        ? chess.load_pgn(pgnText) 
                        : chess.loadPgn(pgnText);

                    if (!isValidPgn) {
                        e.preventDefault();
                        alert("Invalid PGN format. Please check your text.");
                    }
                } catch (error) {
                    e.preventDefault();
                    console.error("PGN validation error:", error);
                    alert("An error occurred while validating the PGN.");
                }
            });
        }
    }
});
document.addEventListener('DOMContentLoaded', () => {
    const section = document.querySelector('[data-sync-status-url]');
    if (!section) return;
    const cards = Array.from(section.querySelectorAll('[data-sync-platform]'));
    if (!cards.some(card => card.dataset.syncState === 'running')) return;

    async function pollSyncs() {
        try {
            const response = await fetch(section.dataset.syncStatusUrl, {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin'
            });
            if (!response.ok) throw new Error(`Sync status returned ${response.status}`);
            const statuses = await response.json();
            let finished = false;
            let stillRunning = false;

            cards.forEach(card => {
                const sync = statuses[card.dataset.syncPlatform];
                if (!sync) return;
                if (card.dataset.syncState === 'running' && sync.status !== 'running') finished = true;
                card.dataset.syncState = sync.status;
                const badge = card.querySelector('[data-sync-badge]');
                const details = card.querySelector('[data-sync-details]');
                badge.className = `analysis-sync-badge analysis-sync-badge-${sync.status}`;
                badge.textContent = sync.status === 'running' ? 'Syncing' :
                    sync.status === 'completed' ? 'Sync complete' : 'Sync failed';
                details.textContent = sync.details || '';
                if (sync.status === 'running') stillRunning = true;
            });

            if (finished) {
                window.location.reload();
            } else if (stillRunning) {
                setTimeout(pollSyncs, 2500);
            }
        } catch (error) {
            setTimeout(pollSyncs, 5000);
        }
    }

    setTimeout(pollSyncs, 2500);
});

// Native dialog provides focus containment and Escape dismissal.
document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.querySelector('.analysis-pgn-dialog');
    const opener = document.querySelector('[data-open-pgn]');
    if (!dialog || !opener) return;
    opener.addEventListener('click', () => {
        dialog.showModal();
        dialog.querySelector('textarea').focus();
    });
    dialog.querySelector('[data-close-pgn]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => opener.focus());
});
