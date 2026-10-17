import { createSparringEngine } from './sparring/uci_engine.js';
import { createTablebaseClient, tablebaseMove, tablebaseAssessment } from './tablebase.js';

const tablebases = createTablebaseClient();

export function createEndgameEngine({ local = createSparringEngine({strength: 8, movetime: 1000}), tables = tablebases } = {}) {
    let disposed = false, generation = 0;
    return {
        async bestMove(state) {
            const ticket = generation;
            let selected;
            try { selected = tablebaseMove(state, await tables.lookup(state.fen)); } catch (_) {}
            if (disposed || ticket !== generation) throw Error('Engine cancelled');
            return selected || local.bestMove(state);
        },
        async assess(state, uci) {
            const ticket = generation;
            let result = null;
            try { result = tablebaseAssessment(state, await tables.lookup(state.fen), uci); } catch (_) {}
            if (disposed || ticket !== generation) throw Error('Engine cancelled');
            return result;
        },
        analyze(state, options) { return local.analyze(state, options); },
        cancel() { generation++; local.cancel(); },
        dispose() { disposed = true; generation++; local.dispose(); }
    };
}
