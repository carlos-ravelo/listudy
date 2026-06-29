const Chessground = require('chessground').Chessground;
const Chess = require('chess.js');

document.addEventListener("DOMContentLoaded", () => {
    const boardContainer = document.getElementById("chess-training-board");
    if (!boardContainer) return;

    let originalMistakes = [];
    try {
        originalMistakes = JSON.parse(boardContainer.getAttribute("data-mistakes") || "[]");
    } catch (e) {
        console.error("Error parsing mistakes data:", e);
    }

    if (originalMistakes.length === 0) {
        boardContainer.innerHTML = "<p>No mistakes to train! You are perfect in this study.</p>";
        return;
    }

    // 1. Separar en bloques por prioridad (Buckets)
    let critical = []; // 5 o más fallos
    let medium = [];   // 2 a 4 fallos
    let low = [];      // 1 fallo

    originalMistakes.forEach(m => {
        if (m.times_repeated >= 5) critical.push(m);
        else if (m.times_repeated >= 2) medium.push(m);
        else low.push(m);
    });

    // 2. Función para mezclar aleatoriamente (Fisher-Yates)
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // 3. Unir los bloques ya mezclados internamente
    let mistakes = [...shuffle(critical), ...shuffle(medium), ...shuffle(low)];

    let currentIndex = 0;
    let chess = new Chess();
    let ground;

    const statusEl = document.getElementById("training-status");
    const infoEl   = document.getElementById("mistake-info");
    const nextBtn  = document.getElementById("next-mistake-btn");
    const paginationEl = document.getElementById("mistakes-pagination");
    const hintBtn = document.getElementById("hint-btn");
    const solveBtn = document.getElementById("solve-btn");

    if (paginationEl) paginationEl.style.alignItems = "center";


    function renderDots() {
        if (!paginationEl) return;
        paginationEl.innerHTML = "";
        
        // Damos más espacio entre puntos para que al crecer no choquen
        paginationEl.style.gap = "12px"; 
        
        mistakes.forEach((mistake, index) => {
            const dot = document.createElement('div');
            
            // LÓGICA DE ESCALA
            let baseScale = 1;
            let baseColor = '#e2e8f0'; // Gris normal
            
            if (mistake.times_repeated >= 5) {
                baseScale = 1.4; // 40% más grande
                baseColor = '#cbd5e0'; // Gris oscuro
            } else if (mistake.times_repeated >= 2) {
                baseScale = 1.15; // 15% más grande
            } else {
                baseScale = 0.85; // Un poco más pequeño para destacar menos
            }

            // El tamaño físico es idéntico para todos, asegurando la alineación
            dot.style.width = '12px';
            dot.style.height = '12px';
            dot.style.borderRadius = '50%';
            dot.style.cursor = 'pointer';
            dot.style.transition = 'background-color 0.2s ease, transform 0.2s ease';
            
            // LÓGICA DE COLORES Y ESTADOS
            if (index === currentIndex) {
                dot.style.backgroundColor = '#3182ce'; // Azul activo
                // Multiplicamos la escala base por 1.3 para que el activo siempre resalte
                dot.style.transform = `scale(${baseScale * 1.3})`; 
                dot.style.boxShadow = '0 0 6px rgba(49, 130, 206, 0.4)';
            } else if (mistake.completed) {
                dot.style.backgroundColor = '#38a169'; // Verde
                dot.style.transform = `scale(${baseScale})`;
            } else {
                dot.style.backgroundColor = baseColor;
                dot.style.transform = `scale(${baseScale})`;
            }
            
            dot.addEventListener('mouseover', () => {
                if (index !== currentIndex && !mistake.completed) {
                    dot.style.backgroundColor = '#a0aec0';
                }
            });
            dot.addEventListener('mouseout', () => {
                if (index !== currentIndex && !mistake.completed) {
                    dot.style.backgroundColor = baseColor;
                }
            });

            dot.addEventListener('click', () => {
                currentIndex = index;
                statusEl.style.color = "inherit";
                loadMistake(currentIndex);
            });
            
            paginationEl.appendChild(dot);
        });
    }

    function getLegalMoves() {
        const dests = new Map();
        chess.SQUARES.forEach(square => {
            const moves = chess.moves({ square, verbose: true });
            if (moves.length) dests.set(square, moves.map(m => m.to));
        });
        return dests;
    }

    function getTurnColor() {
        return chess.turn() === 'w' ? 'white' : 'black';
    }

    function loadMistake(index) {
        renderDots(); // Update dots on every load

        if (index >= mistakes.length) {
            statusEl.innerText = "Training Complete!";
            infoEl.innerText = "You have reviewed all your mistakes.";
            boardContainer.style.pointerEvents = "none";
            nextBtn.style.display = "none";
            if (paginationEl) paginationEl.style.display = "none";
            return;
        }

        const mistake = mistakes[index];
        chess.load(mistake.fen);
        const turnColor = getTurnColor();

        boardContainer.innerHTML = "";
        ground = Chessground(boardContainer, {
            fen: mistake.fen,
            turnColor,
            orientation: turnColor,
            movable: {
                color: turnColor,
                free: false,
                dests: getLegalMoves(),
                events: { after: onMove }
            }
        });
        ground.redrawAll();
        statusEl.innerText = `Position ${index + 1} of ${mistakes.length}`;
        infoEl.innerText = `You played ${mistake.played} here in ${mistake.times_repeated} game(s). Find the correct move.`;
        nextBtn.style.display = "none";

        if (hintBtn) hintBtn.style.display = "inline-block";
        if (solveBtn) solveBtn.style.display = "inline-block";
        ground.set({ drawable: { autoShapes: [] } }); // Limpia los círculos del hint
    }

    function onMove(orig, dest) {
        const mistake = mistakes[currentIndex];
        const move = chess.move({ from: orig, to: dest, promotion: 'q' });
        
        if (!move) return;

        if (move.san === mistake.expected) {
            mistakes[currentIndex].completed = true;
            ground.set({ movable: { color: undefined } });
            statusEl.innerText = "Correct!";
            statusEl.style.color = "#15781B";
            infoEl.innerText = `Yes, ${mistake.expected} is the right move.`;
            nextBtn.style.display = "block";
            if (hintBtn) hintBtn.style.display = "none";
            if (solveBtn) solveBtn.style.display = "none";
            renderDots();
        } else {
            statusEl.innerText = "Incorrect!";
            statusEl.style.color = "#e53e3e";
            infoEl.innerText = `You tried ${move.san}. Try again!`;

            setTimeout(() => {
                chess.undo();
                const turnColor = getTurnColor();

                ground.set({
                    fen: chess.fen(),
                    turnColor,
                    movable: {
                        color: turnColor,
                        free: false,
                        dests: getLegalMoves(),
                        events: { after: onMove }
                    }
                });

                statusEl.innerText = `Position ${currentIndex + 1} of ${mistakes.length}`;
                statusEl.style.color = "inherit";
                infoEl.innerText = `You played ${mistake.played} here in ${mistake.times_repeated} game(s). Find the correct move.`;
            }, 500);
        }
    }

    nextBtn.addEventListener("click", () => {
        currentIndex++;
        statusEl.style.color = "inherit";
        loadMistake(currentIndex);
    });

    if (hintBtn) {
        hintBtn.addEventListener('click', () => {
            const mistake = mistakes[currentIndex];
            // Simulamos el movimiento para saber desde qué casilla sale
            const moveObj = chess.move(mistake.expected);
            if (moveObj) {
                chess.undo(); // Revertimos inmediatamente
                // Dibujamos un círculo azul en la pieza que debe moverse
                ground.set({ drawable: { autoShapes: [{ orig: moveObj.from, brush: 'blue' }] } });
            }
        });
    }

    if (solveBtn) {
        solveBtn.addEventListener('click', () => {
            const mistake = mistakes[currentIndex];
            const moveObj = chess.move(mistake.expected);
            
            if (moveObj) {
                // Movemos la pieza en la interfaz
                ground.move(moveObj.from, moveObj.to);
                ground.set({ movable: { color: undefined } }); // Bloqueamos el tablero
                
                // Actualizamos los textos
                statusEl.innerText = "Solution shown";
                statusEl.style.color = "#d69e2e"; // Color naranja/mostaza
                infoEl.innerText = `The expected move was ${mistake.expected}.`;
                
                // Alternamos botones
                hintBtn.style.display = "none";
                solveBtn.style.display = "none";
                nextBtn.style.display = "inline-block";
                
                renderDots();
            }
        });
    }
    
    loadMistake(0);

    const timeFilter = document.getElementById("time-filter");
    if (timeFilter) {
        timeFilter.addEventListener("change", (e) => {
            window.location.href = window.location.pathname + '?filter=' + e.target.value;
        });
    }
});