function expectedMoves(mistake) {
    return (mistake.expected || '').split(/\s+\/\s+/).filter(Boolean);
}

module.exports = { expectedMoves };
