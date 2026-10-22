const hasComment = move => move?.comments?.[0]?.text != undefined;

export function selectStudyComments({ currentMove, responses, visible, introduction, reading }) {
    const selected = visible ? responses.filter(move => (!introduction || move === introduction) && hasComment(move)) : [];
    return {
        current: visible && hasComment(currentMove) ? currentMove : undefined,
        responses: selected,
        assisted: !introduction && !reading && selected.length > 0
    };
}

export function projectStudyCommentRows(selection, { turnColor, formatMove, responseLabel, decode }) {
    const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1);
    const responseColor = capitalize(turnColor);
    const moveColor = capitalize(turnColor === 'white' ? 'black' : 'white');
    const row = (move, index) => {
        const current = index === undefined;
        const heading = current && move.move == undefined ? ''
            : current ? moveColor + ' ' + formatMove(move) + ':'
                : responseColor + ' ' + (move.move_index == 0 ? '' : responseLabel) + ' ' + formatMove(move) + ':';
        const text = decode(move.comments[0].text.trim());
        return { id: 'comment' + index, heading, text, hidden: text.length === 0 };
    };
    return [
        ...(selection.current ? [row(selection.current)] : []),
        ...selection.responses.map((move, index) => row(move, index))
    ];
}
