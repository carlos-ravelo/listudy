import { incrementAchievementCounter } from '../../modules/achievement_progress.js';
import { readPuzzleData, puzzleLastMove } from '../../modules/training/puzzle_data.js';
import { createTrainingLifecycle } from '../../modules/training/training_lifecycle.js';
import { createLineExercise } from '../../modules/training/line_exercise.js';
import { createBoardGame } from '../../modules/board/board_game.js';
import { playMoveSound } from '../../modules/sounds.js';
import { blockBoardMoves, restoreBoardPosition } from '../../modules/board/board_interaction.js';
require("regenerator-runtime/runtime"); // required for sleep (https://github.com/babel/babel/issues/9849#issuecomment-487040428)

import { onresize, resize_ground, setup_ground, ground_set_moves,
         setup_move_handler } from '../../modules/board/ground.js';
import { setup_chess } from '../../modules/board/chess_utils.js';
import { set_text, clear_all_text, success_div, info_div, error_div, suggestion_div } from '../../modules/info_boxes.js';
import { createTacticAttempts } from '../../modules/training/tactic_attempts.js';
import { createEndgameEngine } from '../../modules/engine/endgame_engine.js';
import { createPromotionController } from '../../modules/board/promotion_controller.js';
import { createPuzzleProgress } from '../../modules/training/puzzle_progress.js';
import { createPuzzleAutoplay } from '../../modules/training/puzzle_autoplay.js';
let progress, picker;
let busy = false, finished = false;
const boardGame = createBoardGame({ getPosition: () => chess, getBoard: () => ground,
    getOptions: () => ({ color }), onMove: playMoveSound });
const exercise = createLineExercise({ getPosition: () => chess,
    applyMove: uci => boardGame.play(uci, { playable: false }),
    validator: createTacticAttempts({ createEngine: () => createEndgameEngine({tables: {lookup: async () => null}}) }) });
const autoplay = createPuzzleAutoplay({isFinished: () => finished, next: () => document.getElementById('next')?.click()});
const lifecycle = createTrainingLifecycle({ restore: () => main(true) });
lifecycle.page.use(autoplay);

function show_div(id) {
    let div = document.getElementById(id);
    if (div == null) {
        return;
    }
    div.classList.remove("hidden");
}

function handle_move(orig, dest) {
    if (busy || finished || exercise.pending || picker?.pending) return;
    if (!picker.request({from: orig, to: dest, legal: chess.moves({verbose: true}), color, orientation: ground.state.orientation})) {
        play_move(orig, dest, 'q');
    }
}

async function play_move(orig, dest, promotion) {
    if (busy || finished || exercise.pending) return;
    const ticket = exercise.revision;
    clear_all_text();
    set_text("to_win", " ");
    set_text("bold_span", " ");
    const result = await exercise.play({from: orig, to: dest, promotion}, {
        onChecking() {
            blockBoardMoves(ground);
            set_text(info_div, i18n.checking);
        },
        onPlayerMove() { clear_all_text(); },
        async beforeReply() {
            await lifecycle.run.sleep(100);
            if (exercise.isCurrent(ticket)) set_text(info_div, i18n.keep_going, {symbol: "★", bold: i18n.best_move});
        }
    });
    if (!result || !exercise.isCurrent(ticket)) return;
    if (result.status === 'illegal') { boardGame.restore(); return; }
    busy = true;
    if (result.status === 'accepted') {
        if (result.complete) {
            finished = true; exercise.stop();
            progress?.finish();
            incrementAchievementCounter('achievements_tactics_solved');
            set_text(success_div, " ", {bold: i18n.success});
            show_div("next");
            autoplay.completed();
        }
    } else {
        clear_all_text();
        await lifecycle.run.sleep(300);
        if (!exercise.isCurrent(ticket)) return;
        boardGame.restore();
        const uncertain = result.status === 'unknown';
        set_text(uncertain ? info_div : error_div, uncertain ? i18n.unconfirmed : i18n.keep_trying, uncertain ? {} : {bold: i18n.wrong_move});
        show_div("next");
        progress?.assist();
        if (!uncertain) progress?.mistake();
        show_div("solution");
    }
    boardGame.restore({ playable: !finished });
    busy = false;
}

function setup_last_move() {
    ground.state.lastMove = puzzleLastMove(last_move);
}

/*
 * Dirty hack? Load the required values from a hidden form field.
 * The values of the hidden form field is changed by the push_redirect
 * First this was done inside of a script but the script would not get
 * re-evaluated by the browser resulting in old values being used.
 */
function load_data() {
    ({ fen, color, moves, last_move } = readPuzzleData());
}

function show_which_side() {
    let turn = color == "white" ? i18n.find_the_best_white : i18n.find_the_best_black;
    set_text(info_div, turn, {bold: i18n.your_turn, symbol: "♔"});
}

function main(force = false) {
    if (!lifecycle.page.active) return;
    autoplay.refresh();
    if (!document.getElementById('fen')) { lifecycle.reset(); return; }
    const key = ['fen', 'moves', 'last_move', 'puzzle_identity', 'puzzle_attempt'].map(id => document.getElementById(id)?.value).join('|');
    if (force !== true && main.loadedKey === key && window.ground?.state.dom.elements.board.isConnected) return;
    main.loadedKey = key;
    const scope = lifecycle.reset();
    scope.use(() => exercise.stop());
    scope.use(autoplay.cancel);
    autoplay.reset();
    clear_all_text();
    document.getElementById('next')?.classList.add('hidden');
    const solution = document.getElementById('solution');
    solution?.classList.add('hidden');
    solution?.removeAttribute('open');
    busy = false; finished = false; exercise.reset();
    picker = scope.use(createPromotionController({element: document.querySelector('[data-promotion-picker]'),
        onOpen() { restoreBoardPosition(ground, chess, { playable: false }); },
        onChoose(promotion, move) {
            restoreBoardPosition(ground, chess, { color });
            play_move(move.from, move.to, promotion);
        },
        onCancel() {
            restoreBoardPosition(ground, chess, { color });
        }
    }));
    load_data();
    let storage;
    try { storage = window.localStorage; } catch (_) {}
    progress = createPuzzleProgress(document.getElementById('puzzle_identity')?.value, {storage});
    if (!fen) {
        clear_all_text();
        setup_ground();
        scope.use(ground);
        ground.set({viewOnly: true, movable: {color: undefined, dests: new Map()}});
        resize_ground();
        return;
    }
    show_which_side();
    setup_ground(fen);
    scope.use(ground);
    ground.set({fen, turnColor: color, movable: {color}});
    setup_last_move(); 
    setup_chess(fen);
    exercise.reset({ initialFen: fen, moves, format: 'san' });
    ground_set_moves();
    resize_ground();
    setup_move_handler(scope.guard(handle_move));
}

lifecycle.page.listen(document, "phx:update", main);
lifecycle.page.listen(document, "click", event => {
    if (event.target.closest('#next')) autoplay.cancel();
}, true);
lifecycle.page.assign(window, 'onresize', onresize);
main();
