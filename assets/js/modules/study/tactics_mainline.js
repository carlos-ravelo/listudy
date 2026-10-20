// Practice the first user continuation against every documented defense.
// Keep other user continuations separately for neutral feedback and traps.
function tacticsMainline(trees, studyColor) {
    const standard = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    return trees.map(tree => {
        const fen = (tree.headers.FEN || standard).split(' ');
        const player = tree.user_color ? tree.user_color === 'white' ? 'w' : 'b'
            : fen.slice(0, 4).join(' ') === standard
                ? studyColor === 'white' ? 'w' : 'b' : fen[1];
        function classify(nodes, turn, bad = false, alternative = false) {
            return (nodes || []).map((node, index) => {
                const is_bad_line = bad || turn === player && (node.nags || [])
                    .some(nag => [2, 4, 6].includes(Number(String(nag).replace('$', ''))));
                const is_alternative = !is_bad_line && (alternative || turn === player && index > 0);
                return { ...node, is_bad_line, is_alternative,
                    children: classify(node.children, turn === 'w' ? 'b' : 'w', is_bad_line, is_alternative) };
            });
        }
        function practice(nodes, turn) {
            const choices = turn === player ? (nodes || []).slice(0, 1) : nodes || [];
            return choices.filter(node => !node.is_bad_line).map(node => ({ ...node,
                children: practice(node.children, turn === 'w' ? 'b' : 'w') }));
        }
        const tactics_root = classify(tree.root, fen[1]);
        return { ...tree, tactics_root, root: practice(tactics_root, fen[1]) };
    });
}

function tacticsCandidates(tree, path) {
    let nodes = tree.tactics_root || [];
    for (const index of path) nodes = nodes[index]?.children || [];
    return nodes;
}

function classifyTacticsMove(nodes, san) {
    const node = nodes.find(node => node.move === san);
    if (!node) return { kind: 'invalid' };
    return { kind: node.is_bad_line ? 'trap' : node.is_alternative ? 'alternative' : 'mainline', node };
}

export { tacticsMainline, tacticsCandidates, classifyTacticsMove };
