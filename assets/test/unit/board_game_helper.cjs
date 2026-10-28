const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = (context, { options = { color: 'both' }, onMove } = {}) => {
    require('./chess_moves_helper.cjs')(context);
    for (const name of ['board/board_interaction', 'board/board_game']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules', name + '.js'), 'utf8')
            .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
    }
    context.boardGame = context.createBoardGame({ getPosition: () => context.chess, getBoard: () => context.ground,
        getOptions: () => options, onMove: onMove || ((move, position) => context.ground_move?.(move, position)) });
    return context.boardGame;
};
