// Render the author's continuation on a separate board so grading retains the
// original position and route. A cancelled presentation never records a result.
export async function presentTacticsTrap({ board, node, render, wait, isCurrent, delay = 350 }) {
    const move = board.move(node.move);
    if (!move) return null;
    render(board, move);
    await wait(delay);
    if (!isCurrent()) return null;
    const reply = node.children?.[0];
    if (reply) {
        const response = board.move(reply.move);
        if (response) {
            render(board, response);
            await wait(delay);
            if (!isCurrent()) return null;
        }
    }
    return board;
}
