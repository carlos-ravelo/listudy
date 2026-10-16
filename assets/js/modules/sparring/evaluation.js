export function winningChances(score, turn, player) {
    if (!score) return null;
    const value = score.value * (turn === player ? 1 : -1);
    if (score.type === 'mate') return score.value === 0 ? (turn === player ? 0 : 100) : value > 0 ? 100 : 0;
    return 100 / (1 + Math.exp(-0.00368208 * value));
}

// Lichess Advice.scala uses drops of .1/.2/.3 on a [-1, 1] scale:
// these are 5/10/15 percentage points on our [0, 100] scale.
// https://github.com/lichess-org/lila/blob/master/modules/tree/src/main/Advice.scala
export function lossJudgement(loss) {
    return loss >= 15 ? 'blunder' : loss >= 10 ? 'mistake' : loss >= 5 ? 'inaccuracy' : null;
}

function playerScore(position, player) {
    const value = position.score.value * (position.turn === player ? 1 : -1);
    return { type: position.score.type, value,
        winningMate: position.score.type === 'mate' && (position.score.value === 0 ? position.turn !== player : value > 0) };
}

export function assessMove(before, after, player, playedMove) {
    const from = winningChances(before.score, before.turn, player);
    const to = winningChances(after.score, after.turn, player);
    if (from === null || to === null) return null;
    const loss = Math.max(0, from - to);
    const first = playerScore(before, player), last = playerScore(after, player);
    let error = null;
    if (first.type === 'cp' && last.type === 'cp') error = lossJudgement(loss);
    else if (first.type === 'cp' && last.type === 'mate' && !last.winningMate) {
        error = first.value < -999 ? 'inaccuracy' : first.value < -700 ? 'mistake' : 'blunder';
    } else if (first.winningMate && !last.winningMate) {
        error = last.type === 'cp' && last.value > 999 ? 'inaccuracy'
            : last.type === 'cp' && last.value > 700 ? 'mistake' : 'blunder';
    }
    return { loss, before: from, after: to,
        grade: error || (playedMove && before.uci === playedMove ? 'best' : 'acceptable') };
}
