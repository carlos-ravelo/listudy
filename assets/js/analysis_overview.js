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