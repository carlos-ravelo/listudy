export function winningChances(score, turn, player) {
    if (!score) return null;
    const value = score.value * (turn === player ? 1 : -1);
    if (score.type === 'mate') return score.value === 0 ? (turn === player ? 0 : 100) : value > 0 ? 100 : 0;
    return 100 / (1 + Math.exp(-0.00368208 * value));
}

export function assessMove(before, after, player) {
    const from = winningChances(before.score, before.turn, player);
    const to = winningChances(after.score, after.turn, player);
    if (from === null || to === null) return null;
    const loss = Math.max(0, from - to);
    return { loss, before: from, after: to,
        grade: loss >= 20 ? 'blunder' : loss >= 10 ? 'mistake' : loss >= 5 ? 'inaccuracy' : 'good' };
}
