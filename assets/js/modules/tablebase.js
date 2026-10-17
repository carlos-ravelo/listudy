const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;
const outcomes = {win: 1, loss: -1, draw: 0, 'cursed-win': 0, 'blessed-loss': 0};

export function tablebasePosition(state, data) {
    if (!data || !Object.prototype.hasOwnProperty.call(outcomes, data.category) || !Array.isArray(data.moves)) return null;
    const board = new Chess(state.initialFen);
    for (const uci of state.moves) {
        if (!board.move({from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4]})) return null;
    }
    if (board.fen() !== state.fen || board.game_over()) return null;
    const legal = new Set(board.moves({verbose: true}).map(move => move.from + move.to + (move.promotion || '')));
    if (data.moves.length !== legal.size || new Set(data.moves.map(move => move.uci)).size !== legal.size) return null;
    const candidates = [];
    for (const move of data.moves) {
        if (!legal.has(move.uci) || !Object.prototype.hasOwnProperty.call(outcomes, move.category)) return null;
        board.move({from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), promotion: move.uci[4]});
        const draw = board.in_draw() && !board.in_checkmate();
        board.undo();
        candidates.push({...move, outcome: draw ? 0 : -outcomes[move.category]});
    }
    const best = Math.max(...candidates.map(move => move.outcome));
    if (best !== outcomes[data.category] && !(outcomes[data.category] < 0 && best === 0)) return null;
    return {outcome: best, moves: candidates};
}

export function tablebaseMove(state, data) {
    const position = tablebasePosition(state, data);
    if (!position) return null;
    const best = position.outcome;
    const choices = position.moves.filter(move => move.outcome === best);
    // API order is DTZ-aware. DTM, when present for every defence, permits
    // prolonging forced mate without mistaking DTZ for a mate distance.
    if (best < 0 && choices.every(move => Number.isInteger(move.dtm) && move.dtm > 0)) choices.sort((a, b) => b.dtm - a.dtm);
    return choices[0]?.uci || null;
}

export function tablebaseAssessment(state, data, uci) {
    const position = tablebasePosition(state, data);
    const move = position?.moves.find(move => move.uci === uci);
    if (!move) return null;
    const loss = position.outcome - move.outcome;
    return {source: 'tablebase', loss: Math.max(0, loss) * 50,
        before: (position.outcome + 1) * 50, after: (move.outcome + 1) * 50,
        grade: loss >= 2 ? 'blunder' : loss === 1 ? 'mistake' : 'acceptable',
        moment: loss > 0 ? position.outcome === 1 ? move.outcome === 0 ? 'winToDraw' : 'winToLoss' : 'drawToLoss' : null};
}

export function createTablebaseClient({ fetcher = (...args) => fetch(...args), timeoutMs = 1200, now = Date.now } = {}) {
    const cache = new Map(), pending = new Map();
    let retryAt = 0;
    function store(key, value, duration) {
        cache.delete(key); cache.set(key, {value, until: now() + duration});
        if (cache.size > 128) cache.delete(cache.keys().next().value);
        return value;
    }
    async function lookup(fen) {
        const fields = fen.split(' ');
        if (fields.length !== 6 || fields[2] !== '-' || (fields[0].match(/[prnbqk]/gi) || []).length > 7) return null;
        // Preserve the halfmove counter: fifty-move outcomes depend on it.
        const key = fields.slice(0, 5).join(' ');
        const entry = cache.get(key);
        if (entry && entry.until > now()) { cache.delete(key); cache.set(key, entry); return entry.value; }
        if (pending.has(key)) return pending.get(key);
        if (now() < retryAt) return null;
        const controller = new AbortController();
        let timer;
        const request = (async () => {
            try {
                const expired = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs); });
                const work = (async () => {
                    const response = await fetcher('https://tablebase.lichess.org/standard?fen=' + encodeURIComponent(fen),
                        {signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
                    if (controller.signal.aborted) return null;
                    if (response.status === 404) return store(key, null, 600000);
                    if (!response.ok) {
                        const header = response.headers?.get('Retry-After');
                        const seconds = header && /^\d+$/.test(header) ? Number(header) : header ? (Date.parse(header) - now()) / 1000 : 30;
                        retryAt = now() + Math.min(600, Math.max(30, seconds || 30)) * 1000;
                        return null;
                    }
                    const data = await response.json();
                    if (controller.signal.aborted) return null;
                    if (!data || !Object.prototype.hasOwnProperty.call(outcomes, data.category) || !Array.isArray(data.moves)) return store(key, null, 60000);
                    return store(key, data, 3600000);
                })();
                const result = await Promise.race([work, expired]);
                if (controller.signal.aborted) retryAt = now() + 30000;
                return result;
            } catch (_) { retryAt = now() + 30000; return null; }
            finally { clearTimeout(timer); pending.delete(key); }
        })();
        pending.set(key, request);
        return request;
    }
    return {lookup};
}
