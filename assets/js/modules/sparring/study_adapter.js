import { createSparringSession, sparringReviewEvery } from './session.js';
import { createStudySparring, sparringStartPositions } from './chess_adapter.js';
import { createSparringEngine, sparringStrength, sparringRating } from './uci_engine.js';
import { createPromotionPicker } from '../promotion_picker.js';
import { setupStudyMoveTree } from '../study/study_move_tree.js';
import { sounds, playMoveSound } from '../sounds.js';
import { set_text, clear_all_text, info_div, error_div, success_div } from '../info_boxes.js';

export function setupStudySparring({ getChapters, getTitle = () => 'Listudy sparring', getPlayer, getBoard, onBegin = () => {},
    onPosition = () => {}, showHints = () => {}, onDecision = () => {}, saveResult = () => {},
    getHistory = () => [], createEngine = createSparringEngine, readStrength = () => null, writeStrength = () => {}, readPreferences = () => ({}), writePreferences = () => {} }) {
    const opener = document.getElementById('practice_sparring');
    const panel = document.getElementById('study_sparring');
    const boardStatus = document.querySelector('[data-sparring-board-status]');
    if (!opener || opener.disabled || !panel) return null;
    const workspace = opener.closest('.study-workspace');
    const settings = document.getElementById('study_sparring_settings');
    const historyDialog = document.getElementById('study_sparring_history_dialog');
    const find = name => settings?.querySelector(`[data-sparring="${name}"]`) || historyDialog?.querySelector(`[data-sparring="${name}"]`) || panel.querySelector(`[data-sparring="${name}"]`) || boardStatus?.querySelector(`[data-sparring="${name}"]`);
    const labels = find('status').dataset;
    let session, ports, picker, pendingPromotion, currentState, sessionId, startedAt;
    let generation = 0, soundCount = 0, heardReviews = 0, readIndex = null, lineRoot = [], lineLength = -1, previousPhase;
    let savedSignature = '';
    let inspectedRow = null;
    let selectedStartFen = null;
    let sessionTitle;
    let engine;
    let strength = sparringStrength(readStrength());
    let strengthChanges = [];
    const paused = state => ['review', 'finished'].includes(state.phase);
    const gradeLabel = grade => labels[grade === 'blunder' ? 'gradeBlunder' : grade === 'good' ? 'acceptable' : grade];
    const isError = grade => ['inaccuracy', 'mistake', 'blunder'].includes(grade);
    const gradeSymbol = grade => ({ best: '★', acceptable: '✓', good: '✓', inaccuracy: '?!', mistake: '?', blunder: '??' })[grade];
    find('strength').value = String(strength);
    const preferences = readPreferences() || {};
    find('review-every').value = String(sparringReviewEvery(preferences.reviewEvery));
    find('pause-blunder').checked = preferences.pauseOnBlunder === true || preferences.pauseOnBlunder === 'true';
    find('live').checked = preferences.live !== false && preferences.live !== 'false';
    const reviewOptions = () => ({ checkpointEvery: sparringReviewEvery(find('review-every').value), pauseOnBlunder: find('pause-blunder').checked });
    function persistPreferences() {
        const options = reviewOptions();
        writePreferences({ reviewEvery: options.checkpointEvery, pauseOnBlunder: options.pauseOnBlunder, live: find('live').checked });
        session?.configure(options);
        if (session) render(session.snapshot());
    }
    const numbers = new Intl.NumberFormat(document.documentElement.lang || undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const format = number => numbers.format(number);
    function continuation(ply, pv) {
        const game = ports.position.at(ply);
        const san = [];
        for (const uci of pv.slice(0, 6)) {
            const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
            if (!move) break;
            san.push(move.san);
        }
        return san.join(' ');
    }
    function result(state) {
        const game = ports.position.at(state.moves.length);
        const outcome = state.reason === 'resigned' ? (state.player === 'w' ? '0-1' : '1-0') : state.result;
        game.header('Event', sessionTitle, 'Result', outcome,
            'White', state.player === 'w' ? 'You' : 'Stockfish / repertoire',
            'Black', state.player === 'b' ? 'You' : 'Stockfish / repertoire');
        return { id: sessionId, startedAt, updatedAt: Date.now(), status: state.phase, reason: state.reason,
            scope: 'study', startFen: state.initialFen, sources: ports.repertoire.sources(),
            gradingVersion: 'lichess-style-depth-v2', reviewSettings: reviewOptions(), engine: engine?.metadata?.() || null, opponentLevels: strengthChanges.map(change => ({ ...change })),
            attempts: state.attempts, correct: state.correct, firstDeviation: state.firstDeviation,
            freeCount: state.freeCount, result: outcome, pgn: game.pgn(),
            reviews: state.reviews.map(row => ({ ...row, line: continuation(row.ply, row.pv) })) };
    }
    function download(record) {
        const url = URL.createObjectURL(new Blob([record.pgn], { type: 'application/x-chess-pgn' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'listudy-sparring.pgn'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function history() {
        find('recent').replaceChildren();
        const records = getHistory().filter(record => panel.hidden || record.id !== sessionId).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
        find('history').hidden = !records.length;
        find('history-empty').hidden = !!records.length;
        for (const record of records) {
            const item = document.createElement('details');
            const heading = document.createElement('summary');
            heading.textContent = `${new Date(record.startedAt).toLocaleString()} · ${record.correct}/${record.attempts} · ${record.result}`;
            item.appendChild(heading);
            for (const row of record.reviews || []) {
                const text = document.createElement('p');
                text.textContent = `${row.san}: ${gradeLabel(row.grade)} · ${format(row.loss)} pp · ${row.line || ''}`;
                item.appendChild(text);
            }
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = find('download').textContent;
            button.setAttribute('aria-label', `${button.textContent} · ${new Date(record.startedAt).toLocaleString()}`);
            button.onclick = () => download(record); item.appendChild(button);
            find('recent').appendChild(item);
        }
    }
    function save(state) {
        if (!state.moves.length) return;
        const record = result(state);
        const signature = JSON.stringify({ ...record, updatedAt: 0 });
        if (signature !== savedSignature) { saveResult(record); savedSignature = signature; history(); }
    }
    function stop() {
        if (session && currentState) save(currentState);
        generation++;
        session?.dispose(); picker?.destroy();
        session = null; engine = null; picker = null; pendingPromotion = null;
        workspace?.classList.remove('study-sparring-active', 'study-sparring-paused');
        panel.hidden = true; opener.setAttribute('aria-pressed', 'false');
        if (boardStatus) boardStatus.hidden = true;
        history();
        find('strength').disabled = false;
        getBoard().state.dom.bounds.clear();
        window.dispatchEvent(new CustomEvent('study-sparring-updated', { detail: { active: false } }));
        document.getElementById('hints').disabled = false;
    }
    function seek(ply, row = null, selected = false) {
        if (!session || pendingPromotion) return;
        inspectedRow = row;
        const target = Math.max(0, Math.min(currentState.moves.length, ply));
        readIndex = target === currentState.moves.length && !selected ? null : target;
        render(currentState);
    }
    const moveTree = setupStudyMoveTree({ element: find('moves'), startLabel: labels.start,
        variationLabel: labels.variation, onSelect: path => seek(path.length, null, true) });
    function render(state) {
        currentState = state;
        const board = getBoard();
        const review = paused(state);
        const browsing = readIndex !== null;
        const playable = state.canPlay && !pendingPromotion && !browsing;
        workspace?.classList.toggle('study-sparring-paused', review);
        const game = readIndex === null ? ports.position.game() : ports.position.at(readIndex);
        find('lichess').href = `https://lichess.org/analysis/${encodeURIComponent(game.fen())}?color=${board.state.orientation}`;
        onPosition(game, ports.repertoire.routes(), state.phase);
        const dests = new Map();
        if (playable) for (const move of state.legal) {
            const from = move.slice(0, 2);
            if (!dests.has(from)) dests.set(from, []);
            if (!dests.get(from).includes(move.slice(2, 4))) dests.get(from).push(move.slice(2, 4));
        }
        const last = game.history({ verbose: true }).slice(-1)[0];
        board.set({ fen: game.fen(), turnColor: game.turn() === 'w' ? 'white' : 'black', check: game.in_check(),
            lastMove: last ? [last.from, last.to] : undefined,
            movable: { color: playable ? getPlayer() : undefined, free: false, dests } });
        board.setShapes([]);
        if (state.moves.length > soundCount && state.lastMove) playMoveSound(state.lastMove);
        soundCount = state.moves.length;
        const phase = find('phase');
        const phaseName = state.error ? 'error' : state.phase;
        phase.textContent = phase.dataset[phaseName];
        phase.dataset.phase = phaseName;
        find('status').textContent = browsing ? labels.browsing : state.error ? labels.error : review
            ? (state.reason === 'blunder' ? labels.blunder : state.phase === 'finished' ? labels.finished : labels.review)
            : state.thinking ? labels.thinking : labels.turn;
        clear_all_text();
        if (state.feedback === 'outside') set_text(error_div, labels.outside);
        if (state.feedback === 'correct' && find('live').checked) set_text(success_div, labels.correct);
        const latest = state.reviews[state.reviews.length - 1];
        if (state.reviews.length > heardReviews && isError(latest.grade) && (find('live').checked || review)) sounds.play('error');
        heardReviews = state.reviews.length;
        if (!browsing && latest && state.feedback !== 'outside' && (find('live').checked || review)) {
            set_text(isError(latest.grade) ? error_div : latest.grade === 'best' ? success_div : info_div,
                gradeLabel(latest.grade), { symbol: gradeSymbol(latest.grade), transient: !isError(latest.grade) && !review });
        }
        document.getElementById('hints').disabled = !playable || state.phase !== 'theory';
        find('strength').disabled = state.thinking || !!pendingPromotion || state.phase === 'finished';
        find('analyze').disabled = state.thinking || review;
        find('analyze').hidden = review;
        find('continue').hidden = state.phase === 'free' && !state.error || state.phase === 'finished';
        find('continue').disabled = state.thinking;
        find('continue').textContent = state.error ? find('continue').dataset.retry
            : state.phase === 'theory' ? find('continue').dataset.theory : find('continue').dataset.resume;

        find('resign').disabled = state.phase === 'finished';
        find('resign').hidden = state.phase === 'finished';
        const actions = panel.querySelector('.sparring-actions');
        const primary = review || state.error ? find('continue') : find('analyze');
        for (const name of ['analyze', 'continue']) find(name).dataset.primary = String(find(name) === primary);
        actions.hidden = state.phase === 'finished';
        actions.dataset.theory = String(state.phase === 'theory' && !state.error);
        actions.dataset.secondary = String(['analyze', 'continue'].some(name => !find(name).hidden && find(name) !== primary));
        if (actions.firstElementChild !== primary) {
            const focused = document.activeElement;
            actions.prepend(primary);
            if (actions.contains(focused) && !focused.hidden) focused.focus({ preventScroll: true });
        }
        find('download').disabled = !state.moves.length;
        find('summary').hidden = !review;
        if (review) {
            const first = state.reviews.filter(row => !row.assisted);
            find('theory-score').textContent = `${state.correct}/${state.attempts}`;
            find('engine-score').textContent = `${first.length}/${state.freeCount}`;
            find('average').textContent = first.length ? format(first.reduce((sum, row) => sum + row.loss, 0) / first.length) : '—';
            find('outcome').textContent = state.reason === 'resigned' ? `${labels.resigned} · ${result(state).result}` : state.result === '*' ? '' : `${state.result === '1/2-1/2' ? labels.draw
                : (state.result === '1-0') === (state.player === 'w') ? labels.won : labels.lost} · ${state.result}`;
            find('coverage').textContent = first.length < state.freeCount ? labels.unanalysed : '';
            find('deviation').textContent = state.firstDeviation
                ? `${labels.deviation}: ${continuation(state.firstDeviation.ply, [state.firstDeviation.uci])}` : '';
            find('empty-analysis').hidden = state.reviews.length > 0;
            find('grade-counts').replaceChildren();
            for (const grade of ['best', 'acceptable', 'inaccuracy', 'mistake', 'blunder']) {
                const count = first.filter(row => (row.grade === 'good' ? 'acceptable' : row.grade) === grade).length;
                const item = document.createElement('span');
                item.setAttribute('role', 'listitem');
                item.dataset.grade = grade;
                item.dataset.empty = String(count === 0);
                const total = document.createElement('strong'); total.textContent = count;
                const label = document.createElement('span'); label.textContent = `${gradeSymbol(grade)} ${gradeLabel(grade)}`;
                item.append(total, label);
                find('grade-counts').appendChild(item);
            }
            save(state);
            if (previousPhase !== state.phase) document.getElementById('sparring_results_title').focus({ preventScroll: true });
        }
        previousPhase = state.phase;
        // Status wrapping can move the board without changing its size.
        board.state.dom.bounds.clear();
        if (lineLength !== state.moves.length) {
            lineRoot = []; let children = lineRoot;
            for (const san of ports.position.game().history()) { const node = { move: san, children: [] }; children.push(node); children = node.children; }
            lineLength = state.moves.length;
        }
        moveTree.update({ reading: true, chapter: sessionId, root: lineRoot, fen: state.initialFen,
            path: Array(readIndex === null ? state.moves.length : readIndex).fill(0) });
        const showGrades = review || find('live').checked;
        const visibleRows = new Map();
        for (const row of state.reviews) if (state.moves[row.ply] === row.uci && row.positionKey === state.moves.slice(0, row.ply).join(' ')) visibleRows.set(row.ply, row);
        const theory = new Set(state.theoryPlies);
        const moveHistory = ports.position.game().history();
        for (const [ply, button] of [...find('moves').querySelectorAll('[data-move-prefix]')].entries()) {
            const row = visibleRows.get(ply);
            const grade = showGrades && row ? row.grade : theory.has(ply) ? 'theory' : null;
            const base = `${button.dataset.movePrefix} ${moveHistory[ply]}`;
            const text = grade ? `${base} · ${grade === 'theory' ? labels.correct : gradeLabel(grade)}` : base;
            button.title = text;
            button.setAttribute('aria-label', text);
            button.dataset.grade = grade || '';
            let sticker = button.querySelector('.sparring-move-sticker');
            if (!sticker) { sticker = document.createElement('span'); sticker.className = 'sparring-move-sticker'; sticker.setAttribute('aria-hidden', 'true'); button.appendChild(sticker); }
            sticker.textContent = grade === 'theory' ? '▤' : grade ? gradeSymbol(grade) : '';
        }
        const selectedPly = readIndex === null ? state.moves.length : readIndex;
        const row = inspectedRow || (browsing ? visibleRows.get(selectedPly - 1) : [...visibleRows.values()].pop());
        find('move-detail').hidden = (!browsing && !row) || (!selectedPly && !inspectedRow);
        const retryPly = inspectedRow ? inspectedRow.ply : browsing ? selectedPly - 1 : row?.ply;
        find('show-best').hidden = !showGrades || !row?.best;
        find('show-best').disabled = state.thinking;
        find('retry-selected').hidden = !Number.isInteger(retryPly) || retryPly < 0 || retryPly >= state.moves.length;
        find('retry-selected').disabled = state.thinking || !!pendingPromotion;
        find('move-grade').textContent = showGrades && row
            ? `${row.san} ${gradeSymbol(row.grade)} · ${gradeLabel(row.grade)}${row.assisted ? ' · ' + labels.assisted : ''}`
            : theory.has(selectedPly - 1) ? labels.correct : labels.notAnalysed;
        find('move-evaluation').textContent = showGrades && row?.evaluationBefore && row?.evaluationAfter
            ? `${labels.evaluation}: ${evaluation(row.evaluationBefore)} → ${evaluation(row.evaluationAfter)}` : '';
        find('move-recommendation').textContent = showGrades && row?.pv.length
            ? `${labels.recommendation}: ${continuation(row.ply, row.pv)}` : '';
        find('show-best').onclick = () => {
            seek(row.ply, row);
            if (row.best?.length >= 4) board.setShapes([{ orig: row.best.slice(0, 2), dest: row.best.slice(2, 4), brush: 'normal' }]);
        };
        find('retry-selected').onclick = async () => { readIndex = null; inspectedRow = null; await session.retry(retryPly); document.getElementById('chessground').focus(); };
        find('latest').hidden = !browsing;
    }
    async function move(from, to, promotion) {
        if (readIndex !== null) return;
        if (!session || pendingPromotion || !session.snapshot().canPlay) return;
        const choices = session.snapshot().legal.filter(uci => uci.startsWith(from + to) && uci.length === 5);
        if (choices.length && !promotion) {
            pendingPromotion = { from, to }; render(session.snapshot());
            picker.open({ to, color: session.snapshot().turn === 'w' ? 'white' : 'black', orientation: getBoard().state.orientation });
            return;
        }
        const current = generation;
        try {
            const success = await session.move(from + to + (promotion || ''));
            if (!success && current === generation) sounds.play('error');
        } catch (_) { if (current === generation) set_text(error_div, labels.error); }
    }
    async function start() {
        stop(); onBegin();
        const current = generation;
        sessionId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        startedAt = Date.now(); soundCount = 0; heardReviews = 0; readIndex = null; lineLength = -1; previousPhase = null; savedSignature = ''; inspectedRow = null;
        strengthChanges = [{ ply: 0, level: strength, eloTarget: sparringRating(strength) }];
        panel.hidden = false; workspace?.classList.add('study-sparring-active');
        if (boardStatus) boardStatus.hidden = false;
        opener.setAttribute('aria-pressed', 'true');
        for (const id of ['study_mode', 'practice_smart', 'practice_lines']) document.getElementById(id)?.setAttribute('aria-pressed', 'false');
        window.dispatchEvent(new CustomEvent('study-sparring-updated', { detail: { active: true } }));
        try {
            const chapters = getChapters();
            const starts = sparringStartPositions(chapters);
            if (!starts.some(group => group.fen === selectedStartFen)) selectedStartFen = starts[0]?.fen;
            ports = createStudySparring(chapters, { startFen: selectedStartFen, starts });
            sessionTitle = getTitle();
            find('start-control').hidden = starts.length <= 1;
            find('start').replaceChildren();
            for (const group of starts) {
                const title = group.standard
                    ? find('start').dataset.standard
                    : `${group.chapters[0] + 1}. ` + (chapters[group.chapters[0]].headers.Event || find('start').dataset.custom) + ' · ' + group.fen.split(' ')[5] + ' · ' +
                        (group.fen.split(' ')[1] === 'w' ? find('start').dataset.white : find('start').dataset.black);
                find('start').add(new Option(title, group.fen, false, group.fen === selectedStartFen));
            }
            picker = createPromotionPicker({ element: document.querySelector('.study-board-frame [data-promotion-picker]'),
                onChoose(role) {
                    const pending = pendingPromotion; pendingPromotion = null;
                    move(pending.from, pending.to, role); document.getElementById('chessground').focus();
                },
                onCancel() { pendingPromotion = null; render(session.snapshot()); document.getElementById('chessground').focus(); } });
            engine = createEngine({ strength });
            session = createSparringSession({ ...ports, engine, ...reviewOptions(), player: getPlayer() === 'white' ? 'w' : 'b',
                onDecision, onChange: state => { if (current === generation) {
                    if (readIndex !== null && readIndex >= state.moves.length) readIndex = null;
                    inspectedRow = null; render(state);
                } } });
            history(); await session.start();
        } catch (_) { if (current === generation) set_text(error_div, labels.error); }
    }
    function evaluation(score) {
        const value = score.value * (score.turn === 'w' ? 1 : -1);
        if (score.type === 'mate') return value === 0
            ? (score.turn === 'w' ? '−#0' : '+#0') : `${value > 0 ? '+' : '−'}#${Math.abs(value)}`;
        return `${value > 0 ? '+' : ''}${format(value / 100)}`;
    }
    find('latest').addEventListener('click', () => seek(currentState.moves.length));
    opener.addEventListener('click', () => { if (!session) start(); });
    find('start').addEventListener('change', () => { selectedStartFen = find('start').value; if (session) start(); });
    find('strength').addEventListener('change', () => {
        strength = sparringStrength(find('strength').value);
        engine?.setStrength?.(strength);
        strengthChanges.push({ ply: session?.snapshot().moves.length || 0, level: strength, eloTarget: sparringRating(strength) });
        writeStrength(strength);
        if (session) render(session.snapshot());
    });
    find('continue').addEventListener('click', () => {
        pendingPromotion = null; picker?.close(); readIndex = null;
        const current = generation;
        session?.continueWithEngine().then(() => {
            if (current === generation && session) document.getElementById('chessground').focus();
        }).catch(() => set_text(error_div, labels.error));
    });
    find('analyze').addEventListener('click', () => session?.analyzeHere());
    find('resign').addEventListener('click', () => {
        if (!window.confirm(find('resign').dataset.confirm)) return;
        pendingPromotion = null; picker?.close(); session?.resign();
    });
    for (const name of ['review-every', 'pause-blunder', 'live']) find(name).addEventListener('change', persistPreferences);
    find('download').addEventListener('click', () => { if (session) download(result(session.snapshot())); });
    for (const opener of document.querySelectorAll('[data-study-dialog="study_sparring_history_dialog"]')) opener.addEventListener('click', history);
    history();
    window.addEventListener('pagehide', stop);
    return { get active() { return !panel.hidden; }, start, stop, move, render: () => session && render(session.snapshot()),
        hint() { if (readIndex === null && session?.hint().length) showHints(ports.repertoire.routes()); },
        navigation() { return { canGoBack: !!session && !pendingPromotion && (readIndex ?? currentState.moves.length) > 0,
            canGoForward: !!session && !pendingPromotion && readIndex !== null && readIndex < currentState.moves.length }; },
        back() { if (session) seek((readIndex ?? currentState.moves.length) - 1); },
        forward() { if (session) seek((readIndex ?? currentState.moves.length) + 1); } };
}
