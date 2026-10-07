import Alpine from 'alpinejs';

Alpine.data('studyMaintenance', () => {
    let config, original;
    const identity = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
    return {
        chapters: [], saving: false, status: '', discarding: false,
        init() {
            config = this.$el.dataset;
            this.chapters = JSON.parse(config.chapters);
            original = JSON.stringify(this.chapters);
        },
        get dirty() { return JSON.stringify(this.chapters) !== original; },
        move(index, delta) {
            const target = index + delta;
            if (this.saving || target < 0 || target >= this.chapters.length) return;
            const chapter = this.chapters.splice(index, 1)[0];
            this.chapters.splice(target, 0, chapter);
        },
        add() {
            this.chapters.push({ id: identity(), source_index: null, title: config.newChapter, moves: 0 });
        },
        duplicate(index) {
            const chapter = this.chapters[index];
            this.chapters.splice(index + 1, 0, { ...chapter, id: identity(), duplicate: chapter.source_index !== null,
                title: chapter.title + ' (' + config.copyLabel + ')' });
        },
        remove(index) {
            if (this.chapters.length <= 1 || this.saving) return;
            if (window.confirm(config.deletePrompt.replace('%s', this.chapters[index].title))) this.chapters.splice(index, 1);
        },
        discard() {
            if (!window.confirm(config.discardPrompt)) return;
            this.chapters = JSON.parse(original);
            this.status = '';
        },
        openEditor(event, chapter) {
            if (this.saving || chapter.source_index === null || chapter.duplicate) { event.preventDefault(); return; }
            if (this.dirty && !window.confirm(config.discardPrompt)) { event.preventDefault(); return; }
            this.discarding = true;
        },
        beforeLeave(event) {
            if (!this.dirty || this.discarding) return;
            event.preventDefault(); event.returnValue = '';
        },
        async save() {
            if (this.saving || !this.dirty) return;
            this.saving = true; this.status = config.saving;
            try {
                const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
                if (!token) throw new Error(config.saveError);
                const response = await fetch(config.saveUrl, {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
                    body: JSON.stringify({ revision: config.revision, chapters: this.chapters })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || config.saveError);
                this.discarding = true;
                window.location.assign(result.url);
            } catch (error) {
                this.status = error.message || config.saveError;
                this.saving = false;
            }
        }
    };
});
window.Alpine = Alpine;
Alpine.start();
