export function createStudyPreferences({ storage, labels, tactics = false }) {
    const definitions = {
        arrows: { key: tactics ? 'tactics_show_arrows' : 'show_arrows',
            choices: [labels.arrows_new2x, labels.arrows_new5x, labels.arrows_always, labels.arrows_hidden],
            fallback: tactics ? labels.arrows_hidden : labels.arrows_new2x },
        arrowType: { key: 'arrow_type',
            choices: [labels.arrow_type_playable, labels.arrow_type_pgn, labels.arrow_type_both],
            fallback: labels.arrow_type_both },
        keyMoves: { key: 'key_moves_mode',
            choices: [labels.key_move_enabled, labels.key_move_disabled], fallback: labels.key_move_enabled },
        review: { key: 'board_review',
            choices: [labels.review_fast, labels.review_slow], fallback: labels.review_fast },
        moveDelay: { key: 'move_delay_time',
            choices: [labels.instant, labels.fast, labels.medium, labels.slow], fallback: labels.instant },
        comments: { key: tactics ? 'tactics_show_comments' : 'show_comments',
            choices: [labels.comments_always_on, labels.comments_hidden, labels.comments_when_arrows],
            fallback: tactics ? labels.comments_hidden : labels.comments_when_arrows }
    };
    const values = {};
    function reload() {
        for (const [name, definition] of Object.entries(definitions)) {
            const value = storage.getItem(definition.key);
            values[name] = definition.choices.includes(value) ? value : definition.fallback;
        }
    }
    reload();
    return {
        reload,
        get: name => values[name],
        snapshot: () => ({ values: { ...values }, keyMovesEnabled: values.keyMoves === labels.key_move_enabled }),
        cycle(name) {
            if (!Object.hasOwn(definitions, name)) return false;
            const { key, choices } = definitions[name];
            values[name] = choices[(choices.indexOf(values[name]) + 1) % choices.length];
            storage.setItem(key, values[name]);
            return true;
        }
    };
}
