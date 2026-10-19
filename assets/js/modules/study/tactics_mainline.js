// Keep the source tree for reading; practice follows only the author's main line.
function tacticsMainline(trees, studyColor) {
    const standard = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    return trees.map(tree => {
        const fen = (tree.headers.FEN || standard).split(' ');
        const player = tree.user_color ? tree.user_color === 'white' ? 'w' : 'b'
            : fen.slice(0, 4).join(' ') === standard
                ? studyColor === 'white' ? 'w' : 'b' : fen[1];
        function mainline(nodes, turn) {
            const node = nodes?.[0];
            if (!node || turn === player && (node.nags || []).some(nag => [2, 4, 6].includes(Number(String(nag).replace('$', ''))))) return [];
            return [{ ...node, children: mainline(node.children, turn === 'w' ? 'b' : 'w') }];
        }
        return { ...tree, root: mainline(tree.root, fen[1]) };
    });
}

export { tacticsMainline };
