import { createTrainingLifecycle } from './modules/training_lifecycle.js';
import { createLineExercise } from './modules/line_exercise.js';
import { createBoardGame } from './modules/board_game.js';
import { playMoveSound } from './modules/sounds.js';
const Chessground = require('chessground').Chessground;
const Chess = require('chess.js')
import { ground_init_state, onresize, resize_ground, setup_ground, ground_set_moves,
         setup_move_handler } from './modules/ground.js';
import { turn_color, setup_chess, uci_to_san, san_to_uci } from './modules/chess_utils.js';

function nFormatter(num, digits) {
  var si = [
    { value: 1, symbol: "" },
    { value: 1E3, symbol: "k" },
    { value: 1E6, symbol: "M" },
    { value: 1E9, symbol: "G" },
    { value: 1E12, symbol: "T" },
    { value: 1E15, symbol: "P" },
    { value: 1E18, symbol: "E" }
  ];
  var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  var i;
  for (i = si.length - 1; i > 0; i--) {
    if (num >= si[i].value) {
      break;
    }
  }
  return (num / si[i].value).toFixed(digits).replace(rx, "$1") + si[i].symbol;
}

function remove_info(type) {
    let d = document.getElementById(type);
    d.classList.add("hidden");
}

function flash_info(text, type) {
    let d = document.getElementById(type);
    d.classList.remove("hidden");
    d.innerText = text;
    lifecycle.run.timeout(() => remove_info(type), 2000);
}

function digits(n) {
    let a = nFormatter(n, 1);
    if (a.length <= 5) {
        return 2;
    }
    return 1;
}

function display_rating() {
    let rating = nFormatter(chessclicker.rating, digits(chessclicker.rating));
    document.title = rating + " - ChessClicker - Listudy";
    document.getElementById("rating").innerText = rating;
    document.getElementById("rps").innerText = nFormatter(rps(), 1);
    document.getElementById("per_solve").innerText = nFormatter(per_solve(), 1);
}

function per_solve() {
    let p = 5;
    for (let i = 0; i < teachers.length; ++i) {
        p += teachers[i].inc_solve * chessclicker.teachers[i];
    }
    return p;
}

function tactic_solved() {
    chessclicker.rating += per_solve();
}

/*
 * Trigger liveview click handler
 */
function next_puzzle() {
    let a = document.getElementById("next");
    a.click();
}

const boardGame = createBoardGame({ getPosition: () => chess, getBoard: () => ground,
    getOptions: () => ({ color: 'both' }), onMove: playMoveSound });
const exercise = createLineExercise({ getPosition: () => chess, applyMove: uci => boardGame.play(uci) });
const lifecycle = createTrainingLifecycle({ restore: () => main() });

async function handle_move(orig, dest, extraInfo) {
    const ticket = exercise.revision;
    const result = await exercise.play({from: orig, to: dest, promotion: 'q'});
    if (!result || !exercise.isCurrent(ticket)) return;
    if (result.status === 'accepted') {
        if (result.complete) {
            exercise.stop();
            tactic_solved();
            flash_info("Tactic Solved", "success");
            next_puzzle();
        }
    } else {
        boardGame.restore();
        if (result.status !== 'illegal') {
            flash_info("Wrong move", "error");
            next_puzzle();
        }
    }
}

function setup_last_move() {
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

function main() {
    if (!lifecycle.page.active) return;
    const scope = lifecycle.reset();
    scope.use(() => exercise.stop());
    update_teachers();
    display_rating();
    teacher_benefits();
    load_data();
    setup_ground(fen);
    scope.use(ground);
    setup_last_move(); 
    setup_chess(fen);
    exercise.reset({ initialFen: fen, moves, format: 'san' });
    ground_set_moves();
    resize_ground();
    setup_move_handler(scope.guard(handle_move));
}

window.teachers = [
    {base_cost: 10, rps: 0.1, inc_solve: 3},
    {base_cost: 100, rps: 1, inc_solve: 40},
    {base_cost: 1100, rps: 8, inc_solve: 340},
    {base_cost: 12000, rps: 47, inc_solve: 2400},
    {base_cost: 130000, rps: 260, inc_solve: 14000},
    {base_cost: 1400000, rps: 1400, inc_solve: 61500},
    {base_cost: 20000000, rps: 7800, inc_solve: 420000},
    {base_cost: 330000000, rps: 42000, inc_solve: 1020000},
    {base_cost: 5600000000, rps: 260000, inc_solve: 7680000},
    {base_cost: 75000000000, rps: 1000000, inc_solve: 60300000},
    {base_cost: 100000000000, rps: 4500000, inc_solve: 1200000000},
    {base_cost: 1960000000000, rps: 13500000, inc_solve: 3200000000},
    {base_cost: 27440000000000, rps: 47000000, inc_solve: 14000000000},
    {base_cost: 360000000000000, rps: 110000000, inc_solve: 42000000000},
    {base_cost: 9000000000000000, rps: 335000000, inc_solve: 15000000000},
    {base_cost: 200000000000000000, rps: 970000000, inc_solve: 49000000000},
    {base_cost: 1400000000000000000, rps: 1230000000, inc_solve: 150000000000}
];

function defaultConfig() {
    return {rating: 5, spend: 0, total: 0, teachers: Array.apply(null, Array(teachers.length)).map(function() { return 0 }) };
}

function teacher_benefits() {
    for (let i = 0; i < teachers.length; ++i) {
        let rps_div = document.getElementById(i + "_rps");
        let solve_div = document.getElementById(i + "_solve");
        rps_div.innerText = teachers[i].rps;
        solve_div.innerText = teachers[i].inc_solve;
    }
}

function reset() {
    window.chessclicker = defaultConfig();
}
window.reset = reset;

function setup() {
    window.chessclicker = JSON.parse(localStorage.getItem("chessclicker")) || defaultConfig();
    for (let i = 0; i < defaultConfig().teachers.length - chessclicker.teachers.length; ++i) {
        chessclicker.teachers.push(0); // a new teacher has been added since last visit
    }
    teacher_benefits();
}

function teacher_cost(base, total) {
    return Math.floor(base*1.2**total);
}

function buy(i) {
    let cost = teacher_cost(teachers[i].base_cost, chessclicker.teachers[i]);
    if (chessclicker.rating >= cost) {
        chessclicker.rating -= cost;
        chessclicker.teachers[i] += 1;
        chessclicker.spend += cost;

        cost = teacher_cost(teachers[i].base_cost, chessclicker.teachers[i]); // new cost
        
        document.getElementById(i + "_cost").innerText = nFormatter(cost, 1);
        document.getElementById(i + "_owned").innerText = chessclicker.teachers[i];

        update_teachers();
    }
    display_rating();
}
window.buy = buy; // make avaliable for the onclick handler

/*
 * Disable or enable teacher css
 */
function update_teachers() {
    for (let i = 0; i < teachers.length; ++i) {
        let owned = chessclicker.teachers[i];
        let cost = teacher_cost(teachers[i].base_cost, owned);
        let t = document.getElementById(i);
        if (cost <= chessclicker.rating) {
            t.classList.remove("disabled");
            t.classList.remove("hidden");
        } else {
            t.classList.add("disabled");
        }
        if (cost*0.45 <= chessclicker.rating || owned != 0) {
            t.classList.remove("hidden");
        }
        document.getElementById(i + "_owned").innerText = chessclicker.teachers[i];
        document.getElementById(i + "_cost").innerText = nFormatter(cost, 1);
    }
}

function rps() {
    let point_increase = 0;
    for (let i = 0; i < chessclicker.teachers.length; ++i) {
        point_increase += teachers[i].rps * chessclicker.teachers[i];
    }
    return point_increase;
}

function tick() {
    let t = rps();
    chessclicker.rating += t;
    chessclicker.total += t;

    update_teachers();
    display_rating();
}

function save() {
    localStorage.setItem("chessclicker", JSON.stringify(chessclicker));
}

lifecycle.page.listen(document, "phx:update", main);
lifecycle.page.assign(window, 'onresize', onresize);
setup();
lifecycle.page.interval(tick, 1000);
lifecycle.page.interval(save, 60000);
lifecycle.page.use(save);
