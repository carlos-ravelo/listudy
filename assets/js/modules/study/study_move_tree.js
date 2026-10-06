const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

// The chapter is already parsed; paths refer to its existing child indexes.
export function chapterMoveLines(root, fen) {
    if (!root.length) return { moves: [], variations: [] };
    const fields = (fen || '').split(' ');
    const initialPly = ((Number(fields[5]) || 1) - 1) * 2 + (fields[1] === 'b' ? 1 : 0);
    function line(node, path) {
        const group = { moves: [], variations: [] };
        while (node) {
            const ply = initialPly + path.length - 1;
            group.moves.push({
                path, san: node.move, number: Math.floor(ply / 2) + 1,
                color: ply % 2 ? 'black' : 'white',
                label: `${Math.floor(ply / 2) + 1}${ply % 2 ? '...' : '.'} ${node.move}`
            });
            (node.children || []).slice(1).forEach((alternative, index) => {
                group.variations.push(line(alternative, [...path, index + 1]));
            });
            node = (node.children || [])[0];
            path = [...path, 0];
        }
        return group;
    }
    const main = line(root[0], [0]);
    main.variations.unshift(...root.slice(1).map((node, index) => line(node, [index + 1])));
    return main;
}

export function readChapterPosition(root, fen, path) {
    if (!Array.isArray(path)) return null;
    const position = new Chess(fen);
    let nodes = root;
    for (const index of path) {
        if (!Number.isInteger(index) || index < 0 || !nodes[index]) return null;
        const node = nodes[index];
        try {
            if (!position.move(node.move)) return null;
        } catch (_error) {
            return null;
        }
        nodes = node.children || [];
    }
    return position;
}

export function setupStudyMoveTree({ element, onSelect, startLabel, variationLabel }) {
    let previousRoot;
    let previousFen;
    let previousChapter;
    let active;
    const buttons = new Map();
    if (!element) return { update() {} };

    function moveButton(label, path, accessibleLabel = label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'study-tree-move';
        button.textContent = label;
        button.setAttribute('aria-label', accessibleLabel);
        button.onclick = () => onSelect([...path]);
        buttons.set(path.join('.'), button);
        return button;
    }

    function renderLine(group, container) {
        const moves = document.createElement('div');
        moves.className = 'study-tree-line';
        const rows = new Map();
        group.moves.forEach(move => {
            if (!rows.has(move.number)) rows.set(move.number, {});
            rows.get(move.number)[move.color] = move;
        });
        rows.forEach((turn, number) => {
            const row = document.createElement('div');
            row.className = 'study-tree-row';
            const index = document.createElement('span');
            index.className = 'study-tree-number';
            index.textContent = `${number}.`;
            row.appendChild(index);
            ['white', 'black'].forEach(color => {
                const move = turn[color];
                const cell = move ? moveButton(move.san, move.path, move.label) : document.createElement('span');
                if (!move) {
                    cell.className = 'study-tree-empty';
                    cell.textContent = '—';
                    cell.setAttribute('aria-hidden', 'true');
                }
                row.appendChild(cell);
            });
            moves.appendChild(row);
        });
        container.appendChild(moves);
        group.variations.forEach(variation => {
            const details = document.createElement('details');
            details.className = 'study-tree-variation';
            const summary = document.createElement('summary');
            summary.textContent = `${variationLabel} · ${variation.moves[0].label}`;
            details.appendChild(summary);
            renderLine(variation, details);
            container.appendChild(details);
        });
    }

    function update({ reading, chapter, root, fen, path }) {
        element.hidden = !reading;
        if (!reading) return;
        if (root !== previousRoot || fen !== previousFen || chapter !== previousChapter) {
            previousRoot = root;
            previousFen = fen;
            previousChapter = chapter;
            buttons.clear();
            active = null;
            element.replaceChildren(moveButton(startLabel, []));
            renderLine(chapterMoveLines(root, fen), element);
        }
        const selected = buttons.get(path.join('.'));
        if (selected === active) return;
        if (active) active.removeAttribute('aria-current');
        active = selected;
        if (!active) return;
        active.setAttribute('aria-current', 'step');
        for (let parent = active.parentElement; parent && parent !== element; parent = parent.parentElement) {
            if (parent.tagName === 'DETAILS') parent.open = true;
        }
        const panel = element.getBoundingClientRect();
        const move = active.getBoundingClientRect();
        if (move.top < panel.top) element.scrollTop += move.top - panel.top;
        else if (move.bottom > panel.bottom) element.scrollTop += move.bottom - panel.bottom;
    }

    return { update };
}
