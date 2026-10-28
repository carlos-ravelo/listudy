import { createLineExercise } from './modules/line_exercise.js';
import { createBoardGame } from './modules/board_game.js';
import { playMoveSound } from './modules/sounds.js';
import { blockBoardMoves, restoreBoardPosition } from './modules/board_interaction.js';
require("regenerator-runtime/runtime"); // required for sleep (https://github.com/babel/babel/issues/9849#issuecomment-487040428)

import { onresize, resize_ground, setup_ground, ground_set_moves,
         setup_move_handler } from './modules/ground.js';
import { setup_chess } from './modules/chess_utils.js';
import { set_text, clear_all_text, success_div, info_div, error_div, suggestion_div } from './modules/info_boxes.js';
import { sleep } from './modules/sleep.js';
import { createTacticAttempts } from './modules/tactic_attempts.js';
import { createEndgameEngine } from './modules/endgame_engine.js';
import { createPromotionController } from './modules/promotion_controller.js';
import { createPuzzleProgress } from './modules/puzzle_progress.js';
import { createPuzzleAutoplay } from './modules/puzzle_autoplay.js';
let progress, picker;
let busy = false, finished = false;
const boardGame = createBoardGame({ getPosition: () => chess, getBoard: () => ground,
    getOptions: () => ({ color }), onMove: playMoveSound });
const exercise = createLineExercise({ getPosition: () => chess,
    applyMove: uci => boardGame.play(uci, { playable: false }),
    validator: createTacticAttempts({ createEngine: () => createEndgameEngine({tables: {lookup: async () => null}}) }) });
const autoplay = createPuzzleAutoplay({isFinished: () => finished, next: () => document.getElementById('next')?.click()});

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
            await sleep(100);
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
            let solves = localStorage.getItem("achievements_tactics_solved") || 0;
            localStorage.setItem("achievements_tactics_solved", Number(solves) + 1);
            set_text(success_div, " ", {bold: i18n.success});
            show_div("next");
            autoplay.completed();
        }
    } else {
        clear_all_text();
        await sleep(300);
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
    if (last_move.length < 4) {
        // this can happen in custom tactics where no last_move is provided
        return;    
    }
    let orig = last_move.substring(0,2);
    let dest = last_move.substring(2,4);
    ground.state.lastMove = [orig, dest];
}

/*
 * Dirty hack? Load the required values from a hidden form field.
 * The values of the hidden form field is changed by the push_redirect
 * First this was done inside of a script but the script would not get
 * re-evaluated by the browser resulting in old values being used.
 */
function load_data() {
    fen = document.getElementById("fen").value;
    color = document.getElementById("color").value;
    moves = document.getElementById("moves").value;
    last_move = document.getElementById("last_move").value;
}

function show_which_side() {
    let turn = color == "white" ? i18n.find_the_best_white : i18n.find_the_best_black;
    set_text(info_div, turn, {bold: i18n.your_turn, symbol: "♔"});
}

function main() {
    autoplay.refresh();
    if (!document.getElementById('fen')) return;
    const key = ['fen', 'moves', 'last_move', 'puzzle_identity', 'puzzle_attempt'].map(id => document.getElementById(id)?.value).join('|');
    if (main.loadedKey === key && window.ground?.state.dom.elements.board.isConnected) return;
    main.loadedKey = key;
    autoplay.reset();
    clear_all_text();
    document.getElementById('next')?.classList.add('hidden');
    const solution = document.getElementById('solution');
    solution?.classList.add('hidden');
    solution?.removeAttribute('open');
    busy = false; finished = false; exercise.reset();
    picker?.destroy();
    picker = createPromotionController({element: document.querySelector('[data-promotion-picker]'),
        onOpen() { restoreBoardPosition(ground, chess, { playable: false }); },
        onChoose(promotion, move) {
            restoreBoardPosition(ground, chess, { color });
            play_move(move.from, move.to, promotion);
        },
        onCancel() {
            restoreBoardPosition(ground, chess, { color });
        }
    });
    load_data();
    let storage;
    try { storage = window.localStorage; } catch (_) {}
    progress = createPuzzleProgress(document.getElementById('puzzle_identity')?.value, {storage});
    if (!fen) {
        clear_all_text();
        window.ground?.destroy();
        setup_ground();
        ground.set({viewOnly: true, movable: {color: undefined, dests: new Map()}});
        resize_ground();
        return;
    }
    show_which_side();
    if (fen != old_fen) {
        // This is done to prevent flickering on the initial load of the
        // tactic. Without this setup_ground is called again after the
        // liveview has connected with the server since its changing the 
        // parent containing div of the chessground. With this check we
        // notice that the fen hasnt changed so we can continue using 
        // this ground
        setup_ground(fen);    
        old_fen = fen;
    }
    ground.set({fen, turnColor: color, movable: {color}});
    setup_last_move(); 
    setup_chess(fen);
    exercise.reset({ initialFen: fen, moves, format: 'san' });
    ground_set_moves();
    resize_ground();
    setup_move_handler(handle_move);
}

document.addEventListener("phx:update", main);
document.addEventListener("click", event => {
    if (event.target.closest('#next')) autoplay.cancel();
}, true);
window.onresize = onresize;
window.old_fen = "abc";
main();
