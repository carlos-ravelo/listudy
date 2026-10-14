import { readChapterPosition } from './study_move_tree.js';

async function replayPositionContext({ root, fen, path, count = 4, present, advance, pause, isCurrent }) {
    // Validate the whole route before changing the board, including custom start FENs.
    if (!readChapterPosition(root, fen, path) || !isCurrent()) return false;
    const start = Math.max(0, path.length - count);
    const prefix = path.slice(0, start);
    const position = readChapterPosition(root, fen, prefix);
    const moves = [];
    let nodes = root;
    path.forEach((index, depth) => {
        const node = nodes[index];
        if (depth >= start) moves.push(node.move);
        nodes = node.children || [];
    });
    present(position, prefix);
    for (const move of moves) {
        await pause(450);
        if (!isCurrent()) return false;
        advance(move);
    }
    if (moves.length) await pause(300);
    return isCurrent();
}

export { replayPositionContext };
