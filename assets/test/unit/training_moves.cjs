const assert = require('node:assert/strict');
const { expectedMoves } = require('../../js/modules/analysis/training_moves');

assert.deepEqual(expectedMoves({ expected: 'e4' }), ['e4']);
assert.deepEqual(expectedMoves({ expected: 'Nf3 / e4' }), ['Nf3', 'e4']);
assert.deepEqual(expectedMoves({ expected: '' }), []);
