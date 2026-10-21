import { normalizeSearchText } from './modules/search_text.js';
import { openDialog, closeDialog } from './modules/dialog_lifecycle.js';
import Alpine from 'alpinejs';

Alpine.data('studyOpeningPicker', () => ({
    name: '', selected: '', query: '', names: [],
    init() {
        this.name = this.$el.dataset.selectedName;
        this.selected = this.$el.dataset.selectedId;
        this.names = JSON.parse(this.$el.dataset.openingNames);
    },
    matches(value) {
        return normalizeSearchText(value).includes(normalizeSearchText(this.query.trim()));
    },
    open() {
        this.query = '';
        openDialog(this.$root.querySelector('.ui-modal'), this.$root.querySelector('#study_opening_picker_button'));
    },
    choose(id, name) {
        this.selected = id;
        this.name = name;
        this.$refs.value.value = id;
        this.$refs.value.dispatchEvent(new Event('change', { bubbles: true }));
        closeDialog(this.$root.querySelector('.ui-modal'));
    }
}));

Alpine.data('studyMetadata', () => ({
    changed: false, saving: false, status: '',
    async save(event) {
        event.preventDefault();
        if (this.saving) return;
        this.saving = true;
        const maintenance = document.querySelector('.study-maintenance');
        this.status = maintenance?.dataset.saving || '';
        try {
            const body = new FormData(this.$el);
            body.set('_stay', 'true');
            const response = await fetch(this.$el.action, { method: 'POST', credentials: 'same-origin', body });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || maintenance?.dataset.saveError);
            this.$el.action = result.action;
            document.querySelector('.study-management-heading .study-edit-link')?.setAttribute('href', result.study_url);
            window.dispatchEvent(new CustomEvent('study-saved', { detail: result }));
            this.changed = false;
            this.status = maintenance?.dataset.saved || '';
        } catch (error) {
            this.status = error.message;
        } finally {
            this.saving = false;
        }
    }
}));

Alpine.data('studyMaintenance', () => {
    let config, original;
    const identity = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
    return {
        chapters: [], saving: false, status: '', discarding: false,
        draggedId: null, dropId: null, dropAfter: false,
        init() {
            config = this.$el.dataset;
            this.chapters = JSON.parse(config.chapters);
            original = JSON.stringify(this.chapters);
        },
        metadataSaved(result) {
            config.saveUrl = result.save_url;
            config.editorUrl = result.editor_url;
            if (result.pgn_changed) {
                this.chapters = result.chapters;
                config.revision = result.revision;
                original = JSON.stringify(this.chapters);
                this.endDrag();
            }
        },
        get dirty() { return JSON.stringify(this.chapters) !== original; },
        startDrag(event, chapter) {
            if (this.saving) { event.preventDefault(); return; }
            this.draggedId = chapter.id;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', chapter.id);
            event.dataTransfer.setDragImage(event.target.closest('.study-maintenance-row'), 20, 20);
        },
        dragOver(event, chapter) {
            if (this.saving || !this.draggedId || chapter.id === this.draggedId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const bounds = event.currentTarget.getBoundingClientRect();
            this.dropId = chapter.id;
            this.dropAfter = event.clientY > bounds.top + bounds.height / 2;
        },
        drop(event, chapter) {
            if (this.saving || !this.draggedId || chapter.id === this.draggedId) { this.endDrag(); return; }
            event.preventDefault();
            const source = this.chapters.findIndex(item => item.id === this.draggedId);
            const target = this.chapters.findIndex(item => item.id === chapter.id);
            if (source < 0 || target < 0) { this.endDrag(); return; }
            const bounds = event.currentTarget.getBoundingClientRect();
            const after = event.clientY > bounds.top + bounds.height / 2;
            const moved = this.chapters.splice(source, 1)[0];
            const destination = this.chapters.findIndex(item => item.id === chapter.id) + (after ? 1 : 0);
            this.chapters.splice(destination, 0, moved);
            this.endDrag();
        },
        endDrag() { this.draggedId = null; this.dropId = null; this.dropAfter = false; },
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
            this.endDrag();
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
                this.chapters = result.chapters;
                original = JSON.stringify(this.chapters);
                config.revision = result.revision;
                this.saving = false;
                this.status = config.saved;
            } catch (error) {
                this.status = error.message || config.saveError;
                this.saving = false;
            }
        }
    };
});
window.Alpine = Alpine;
Alpine.start();
