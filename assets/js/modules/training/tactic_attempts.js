import { createTacticAlternatives } from './tactic_alternatives.js';

export function createTacticAttempts(options) {
    const alternatives = createTacticAlternatives(options);
    let revision = 0, pending = false;
    return {
        get pending() { return pending; },
        reset() {
            revision++;
            pending = false;
            alternatives.reset();
        },
        async validate(...args) {
            if (pending) return null;
            const ticket = revision;
            pending = true;
            try {
                const result = await alternatives.validate(...args);
                return ticket === revision ? result : null;
            } finally {
                if (ticket === revision) pending = false;
            }
        }
    };
}
