export function registerStudyDepth(Alpine) {
    Alpine.data('studyDepth', () => ({
        ready: false, enabled: false, depth: 1, available: 1,
        update(snapshot) {
            Object.assign(this, snapshot);
            this.ready = true;
        },
        change(type, value) {
            if (this.ready) this.$dispatch('study-depth-change', { type, value });
        }
    }));
}

export function bindStudyDepth(element, model, onChange) {
    const publish = () => element.dispatchEvent(new CustomEvent('study-depth-updated', {
        bubbles: true, detail: model.snapshot()
    }));
    const change = event => {
        if (!model.change(event.detail)) return;
        onChange();
        publish();
    };
    element.addEventListener('study-depth-change', change);
    return {
        refresh(chapter, available) {
            model.selectChapter(chapter, available);
            publish();
        },
        destroy() { element.removeEventListener('study-depth-change', change); }
    };
}
