import { moveToUci, playUciMove } from '../chess_moves.js';
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;


export function createSparringChapterRotation({ random = Math.random } = {}) {
    const groups = new Map();
    function shuffle(values) {
        const result = [...values];
        for (let index = result.length - 1; index > 0; index--) {
            const other = Math.floor(random() * (index + 1));
            [result[index], result[other]] = [result[other], result[index]];
        }
        return result;
    }
    return {
        next(chapters, group) {
            const signature = JSON.stringify(group.chapters.map(index => chapters[index].headers.ListudyChapterId || String(index)));
            let rotation = groups.get(group.fen);
            if (!rotation || rotation.signature !== signature) {
                rotation = { signature, remaining: [], last: null };
                groups.set(group.fen, rotation);
            }
            if (!rotation.remaining.length) {
                rotation.remaining = shuffle(group.chapters);
                if (rotation.remaining.length > 1 && rotation.remaining[0] === rotation.last) {
                    [rotation.remaining[0], rotation.remaining[1]] = [rotation.remaining[1], rotation.remaining[0]];
                }
            }
            const selected = rotation.remaining.shift();
            rotation.last = selected;
            return [selected, ...shuffle(group.chapters.filter(index => index !== selected))];
        }
    };
}

export function sparringStartPositions(chapters) {
    const standard = new Chess().fen();
    const normalized = new Map([[standard, standard]]);
    const groups = new Map();
    chapters.forEach((chapter, index) => {
        const raw = chapter.headers.FEN || standard;
        let fen = normalized.get(raw);
        if (!fen) {
            const game = new Chess();
            if (!game.load(raw)) throw new Error('Invalid chapter FEN');
            fen = game.fen(); normalized.set(raw, fen);
        }
        if (!groups.has(fen)) groups.set(fen, { fen, standard: fen === standard, chapters: [] });
        groups.get(fen).chapters.push(index);
    });
    return [...groups.values()].sort((a, b) => Number(b.fen === standard) - Number(a.fen === standard));
}

// Keep only references to compatible branches. Descendants are read on advance.
export function createStudySparring(chapters, { startFen, starts = sparringStartPositions(chapters), chapterOrder = [] } = {}) {
    const group = startFen ? starts.find(group => group.fen === startFen) : starts[0];
    if (!group) throw new Error('No matching repertoire starting position');
    let chess = new Chess(group.fen);
    const initialFen = chess.fen();
    let frontier = group.chapters.map(chapter => ({ chapter, path: [], children: chapters[chapter].root }));
    let available = null;
    const position = {
        game: () => chess,
        at(ply) {
            const replay = new Chess(initialFen);
            for (const move of chess.history({ verbose: true }).slice(0, ply)) replay.move({ from: move.from, to: move.to, promotion: move.promotion });
            return replay;
        },
        restore(ply) { chess = position.at(ply); },
        snapshot() {
            return { initialFen, fen: chess.fen(), turn: chess.turn(), over: chess.game_over(),
                result: chess.in_checkmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') : chess.in_draw() ? '1/2-1/2' : '*',
                lastMove: chess.history({ verbose: true }).slice(-1)[0],
                check: chess.in_check(), legal: chess.moves({ verbose: true }).map(moveToUci) };
        },
        play(move) {
            return !!playUciMove(chess, move);
        }
    };
    function continuations() {
        if (available) return available;
        const legal = new Map(chess.moves({ verbose: true }).map(move => [move.san, move]));
        const next = new Map();
        for (const route of frontier) route.children.forEach((node, index) => {
            const move = legal.get(node.move);
            if (!move) throw new Error('Illegal repertoire continuation');
            const key = moveToUci(move);
            if (!next.has(key)) next.set(key, { uci: key, san: move.san, matches: [] });
            next.get(key).matches.push({ route, node, index });
        });
        available = next;
        return available;
    }
    const source = route => ({ chapter: route.chapter, path: [...route.path],
        id: chapters[route.chapter].headers.ListudyChapterId || String(route.chapter) });
    function routes() {
        const continuing = frontier.filter(route => route.children.length);
        return (continuing.length ? continuing : frontier).map(source);
    }
    return { position, startPositions: starts, repertoire: {
        routes,
        restore(moves) {
            const replay = new Chess(initialFen);
            frontier = group.chapters.map(chapter => ({ chapter, path: [], children: chapters[chapter].root }));
            for (const move of moves) {
                const played = replay.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
                if (!played) throw new Error('Illegal repertoire history');
                frontier = frontier.flatMap(route => route.children.flatMap((node, index) =>
                    node.move === played.san ? [{ chapter: route.chapter, path: [...route.path, index], children: node.children || [] }] : []));
            }
            available = null;
        },
        sources: () => frontier.map(source),
        path: () => routes()[0]?.path || [],
        choices: () => [...continuations().values()].map(({ uci, san }) => ({ uci, san })),
        choose(random = Math.random) {
            const choices = [...continuations().values()];
            const preferred = chapterOrder.find(chapter => choices.some(choice => choice.matches.some(match => match.route.chapter === chapter)));
            const candidates = preferred === undefined ? choices
                : choices.filter(choice => choice.matches.some(match => match.route.chapter === preferred));
            return candidates.length ? candidates[Math.floor(random() * candidates.length)].uci : null;
        },
        advance(move) {
            const choice = continuations().get(move);
            if (!choice) throw new Error('Unknown repertoire continuation');
            frontier = choice.matches.map(({ route, node, index }) => ({ chapter: route.chapter,
                path: [...route.path, index], children: node.children || [] }));
            available = null;
        }
    } };
}

export function createChapterSparring(chapter) {
    return createStudySparring([chapter]);
}
