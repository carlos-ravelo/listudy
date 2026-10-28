const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = context => vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../../js/modules/chess_moves.js'), 'utf8').replace(/^export /gm, ''), context);
