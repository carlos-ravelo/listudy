export function registerStudyPreferences(Alpine) {
    Alpine.data('studyPreferences', () => ({
        ready: false, values: {}, keyMovesEnabled: true,
        update(snapshot) {
            this.values = snapshot.values;
            this.keyMovesEnabled = snapshot.keyMovesEnabled;
            this.ready = true;
        },
        cycle(name) {
            if (this.ready) this.$dispatch('study-preference-change', { name });
        }
    }));
}

export function bindStudyPreferences(element, preferences, onChange) {
    const publish = () => element.dispatchEvent(new CustomEvent('study-preferences-updated', {
        bubbles: true, detail: preferences.snapshot()
    }));
    const change = event => {
        const name = event.detail?.name;
        if (!preferences.cycle(name)) return;
        onChange(name);
        publish();
    };
    element.addEventListener('study-preference-change', change);
    publish();
    return () => element.removeEventListener('study-preference-change', change);
}
