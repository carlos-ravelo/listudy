export function scoreForPlayer(score, turn, player) {
    if (!score) return null;
    const value = score.value * (turn === player ? 1 : -1);
    return { type: score.type, value,
        winningMate: score.type === 'mate' && (score.value === 0 ? turn !== player : value > 0) };
}

export function winningChances(score, turn, player) {
    const result = scoreForPlayer(score, turn, player);
    if (!result) return null;
    if (result.type === 'mate') return result.winningMate ? 100 : 0;
    return 100 / (1 + Math.exp(-0.00368208 * result.value));
}

// Lichess Advice.scala uses drops of .1/.2/.3 on a [-1, 1] scale:
// these are 5/10/15 percentage points on our [0, 100] scale.
// https://github.com/lichess-org/lila/blob/master/modules/tree/src/main/Advice.scala
export function lossJudgement(loss) {
    return loss >= 15 ? 'blunder' : loss >= 10 ? 'mistake' : loss >= 5 ? 'inaccuracy' : null;
}

export function assessMove(before, after, player, playedMove) {
    const from = winningChances(before.score, before.turn, player);
    const to = winningChances(after.score, after.turn, player);
    if (from === null || to === null) return null;
    const loss = Math.max(0, from - to);
    const first = scoreForPlayer(before.score, before.turn, player), last = scoreForPlayer(after.score, after.turn, player);
    let error = null;
    if (first.type === 'cp' && last.type === 'cp') error = lossJudgement(loss);
    else if (first.type === 'cp' && last.type === 'mate' && !last.winningMate) {
        error = first.value < -999 ? 'inaccuracy' : first.value < -700 ? 'mistake' : 'blunder';
    } else if (first.winningMate && !last.winningMate) {
        // A limited search may stop reporting mate after a conversion or promotion.
        // A still decisive score is not evidence that the forced win was lost.
        error = last.type === 'cp' && last.value > 700 ? null : 'blunder';
    }
    // UCI reports +N before the mating side moves and -(N-1) afterwards.
    // https://github.com/official-stockfish/Stockfish/blob/master/src/uci.cpp
    const deliversMate = last.winningMate && after.score.value === 0 && before.turn === player && after.turn !== player;
    const equallyFastMate = first.winningMate && last.winningMate && before.turn === player && after.turn !== player &&
        Math.abs(after.score.value) < Math.abs(before.score.value);
    return { loss, before: from, after: to,
        grade: error || (deliversMate || equallyFastMate || playedMove && before.uci === playedMove ? 'best' : 'acceptable') };
}
