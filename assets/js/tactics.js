require("regenerator-runtime/runtime"); // required for sleep (https://github.com/babel/babel/issues/9849#issuecomment-487040428)

import { onresize, resize_ground, setup_ground, ground_set_moves,
         ground_undo_last_move, setup_move_handler, ground_move } from './modules/ground.js';
import { setup_chess } from './modules/chess_utils.js';
import { set_text, clear_all_text, success_div, info_div, error_div, suggestion_div } from './modules/info_boxes.js';
import { sleep } from './modules/sleep.js';
import { createTacticAlternatives } from './modules/tactic_alternatives.js';
import { createEndgameEngine } from './modules/endgame_engine.js';
import { createPromotionPicker } from './modules/promotion_picker.js';
import { createPuzzleProgress } from './modules/puzzle_progress.js';
import { enginePosition } from './modules/engine_position.js';
const alternatives = createTacticAlternatives({
    createEngine: () => createEndgameEngine({tables: {lookup: async () => null}})
});
let progress, picker, pendingPromotion;
let busy = false, generation = 0, finished = false;

function show_div(id) {
    let div = document.getElementById(id);
    if (div == null) {
        return;
    }
    div.classList.remove("hidden");
}

function handle_move(orig, dest) {
    if (busy || finished || pendingPromotion) return;
    const promotions = chess.moves({verbose: true}).filter(move => move.from === orig && move.to === dest && move.promotion);
    if (promotions.length && document.querySelector('[data-promotion-picker]')) {
        pendingPromotion = {orig, dest};
        ground.set({fen: chess.fen(), movable: {color: undefined, dests: new Map()}});
        picker.open({color, to: dest, orientation: ground.state.orientation});
    } else play_move(orig, dest, 'q');
}

async function play_move(orig, dest, promotion) {
    if (busy || finished) return;
    const ticket = generation, board = chess;
    const candidate = board.move({from: orig, to: dest, promotion});
    if (!candidate) return;
    board.undo();
    let played = candidate.san;
    const target = to_play[0];
    clear_all_text();
    set_text("to_win", " ");
    set_text("bold_span", " ");
    let accepted = played === target;
    let uncertain = false;
    if (!accepted) {
        const expected = board.move(target);
        if (!expected) return;
        board.undo();
        busy = true;
        ground.set({movable: {dests: new Map()}});
        set_text(info_div, i18n.checking);
        const attempted = board.move(played);
        board.undo();
        const result = await alternatives.validate(enginePosition(fen, board), expected.from + expected.to + (expected.promotion || ''), attempted.from + attempted.to + (attempted.promotion || ''), to_play.length);
        if (ticket !== generation) return;
        busy = false;
        clear_all_text();
        accepted = result.status === 'accepted';
        uncertain = result.status === 'unknown';
        if (accepted) {
            const ChessModule = require('chess.js');
            const parser = new (ChessModule.Chess || ChessModule)(board.fen());
            window.to_play = result.line.map(uci => parser.move({from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4]}).san);
            played = to_play[0];
        }
    }
    busy = true;
    ground.set({movable: {dests: new Map()}});
    if (accepted) {
        to_play.shift();
        let m = chess.move(played);
        ground_move(m, chess);
        if (to_play.length >= 2) {
            // theres another move the player has to get correct
            await sleep(100); // instant play by the ai feels weird
            if (ticket !== generation) return;
            set_text(info_div, i18n.keep_going, {symbol:"★", bold: i18n.best_move} );
            let ai_move = to_play.shift();
            let m = chess.move(ai_move);
            ground_set_moves();
            ground_move(m, chess);
        } else {
            // player got the puzzle correct
            finished = true; alternatives.reset();
            progress?.finish();
            let solves = localStorage.getItem("achievements_tactics_solved") || 0;
            localStorage.setItem("achievements_tactics_solved", Number(solves) + 1);
            set_text(success_div, " ", {bold: i18n.success});
            show_div("next");
        }
    } else {
        // player failed the puzzle
        await sleep(300); // instant play by the ai feels weird
        if (ticket !== generation) return;
        ground_undo_last_move(); 
        ground_set_moves();
        set_text(uncertain ? info_div : error_div, uncertain ? i18n.unconfirmed : i18n.keep_trying, uncertain ? {} : {bold: i18n.wrong_move});
        show_div("next");
        progress?.assist();
        if (!uncertain) progress?.mistake();
        show_div("solution");
    }
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
    if (!document.getElementById('fen')) return;
    const key = ['fen', 'moves', 'last_move', 'puzzle_identity', 'puzzle_attempt'].map(id => document.getElementById(id)?.value).join('|');
    if (main.loadedKey === key && window.ground?.state.dom.elements.board.isConnected) return;
    main.loadedKey = key;
    clear_all_text();
    document.getElementById('next')?.classList.add('hidden');
    const solution = document.getElementById('solution');
    solution?.classList.add('hidden');
    solution?.removeAttribute('open');
    generation++; busy = false; finished = false; alternatives.reset();
    pendingPromotion = null;
    picker?.destroy();
    picker = createPromotionPicker({element: document.querySelector('[data-promotion-picker]'),
        onChoose(promotion) {
            const move = pendingPromotion; pendingPromotion = null;
            ground.set({movable: {color}});
            if (move) play_move(move.orig, move.dest, promotion);
        },
        onCancel() {
            pendingPromotion = null;
            ground.set({fen: chess.fen(), turnColor: color, movable: {color}});
            ground_set_moves();
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
    window.to_play = moves.split(" ");
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
    ground_set_moves();
    resize_ground();
    setup_move_handler(handle_move);
}

document.addEventListener("phx:update", main);
window.onresize = onresize;
window.old_fen = "abc";
main();
