const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
require('./chess_moves_helper.cjs')(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/board_shapes.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
module.exports = { moveArrow: context.moveArrow, moveArrows: context.moveArrows };
