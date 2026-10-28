const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = (context, { moves = context.to_play || context.solution || [],
    format = context.to_play ? 'san' : 'uci', validator = context.attempts || null,
    applyOptions = { playable: false }, getPosition = () => context.chess,
    applyMove = uci => context.boardGame.play(uci, applyOptions) } = {}) => {
    context.require = require;
    if (!context.boardGame) require('./board_game_helper.cjs')(context);
    for (const name of ['engine/engine_position', 'training/line_exercise']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules', name + '.js'), 'utf8')
            .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
    }
    context.exercise = context.createLineExercise({ getPosition, applyMove, validator });
    context.exercise.reset({ initialFen: context.initial_fen || context.fen || getPosition().fen(), moves, format });
    return context.exercise;
};
