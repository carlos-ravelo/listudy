import { Chessground } from 'chessground';
import { createChapterEditor } from './modules/study/chapter_editor.js';
import { setupStudyMoveTree } from './modules/study/study_move_tree.js';
import { ground_legal_moves } from './modules/chess_utils.js';

import Alpine from 'alpinejs';

Alpine.data('chapterEditor', () => {
    let chapters, editor, ground, moveTree, config;

    return {
        options: [], chapter: 0, comment: '', promotion: 'q',
        saving: false, dirty: false, hasPrevious: false, hasNext: false, status: '',

        init() {
            config = this.$el.dataset;
            chapters = JSON.parse(config.editor).chapters;
            this.options = chapters.map(({ title }) => ({ title }));
            const requested = new URLSearchParams(window.location.search).get('chapter_index');
            if (requested !== null && /^\d+$/.test(requested) && Number(requested) < chapters.length) {
                this.chapter = Number(requested);
            }
            editor = createChapterEditor(chapters[this.chapter]);
            ground = Chessground(this.$refs.board, {
                orientation: config.color === 'black' ? 'black' : 'white',
                drawable: { enabled: false },
                movable: { free: false, events: { after: (from, to) => this.play(from, to) } }
            });
            moveTree = setupStudyMoveTree({
                element: this.$refs.moves,
                startLabel: config.start,
                variationLabel: config.variation,
                onSelect: path => this.selectPosition(path)
            });
            this.refresh();
        },

        destroy() { ground?.destroy(); },

        refresh() {
            const position = editor.position();
            const color = position.turn() === 'w' ? 'white' : 'black';
            const move = position.history({ verbose: true }).slice(-1)[0];
            this.comment = editor.node().comment;
            this.dirty = editor.dirty;
            this.hasPrevious = editor.path.length > 0;
            this.hasNext = (this.hasPrevious ? editor.node().children : editor.tree.root).length > 0;
            ground.set({
                fen: position.fen(), turnColor: color, check: position.in_check(),
                lastMove: move ? [move.from, move.to] : undefined,
                movable: { color: this.saving ? undefined : color, dests: this.saving ? new Map() : ground_legal_moves(position) }
            });
            moveTree.update({ reading: true, chapter: this.chapter, root: editor.tree.root,
                fen: chapters[this.chapter].fen, path: editor.path });
        },

        play(from, to) {
            if (this.saving) return;
            try {
                if (!editor.play(from, to, this.promotion)) throw new Error('Invalid move');
                this.status = editor.dirty ? config.unsaved : '';
            } catch (_error) {
                this.status = config.invalidMove;
            }
            this.refresh();
        },

        selectPosition(path) {
            if (this.saving) return;
            editor.select(path);
            this.refresh();
        },
        previous() { this.selectPosition(editor.path.slice(0, -1)); },
        next() { this.selectPosition([...editor.path, 0]); },

        updateComment(value) {
            editor.setComment(value);
            this.dirty = editor.dirty;
            this.status = this.dirty ? config.unsaved : '';
        },

        discard() {
            if (!window.confirm(config.discardPrompt)) return;
            editor = createChapterEditor(chapters[this.chapter]);
            this.status = '';
            this.refresh();
        },

        changeChapter(event) {
            if (this.dirty && !window.confirm(config.discardPrompt)) {
                event.target.value = String(this.chapter);
                return;
            }
            this.chapter = Number(event.target.value);
            editor = createChapterEditor(chapters[this.chapter]);
            this.status = '';
            this.refresh();
        },

        beforeLeave(event) {
            if (!this.dirty) return;
            event.preventDefault();
            event.returnValue = '';
        },

        async save() {
            if (this.saving || !this.dirty) return;
            this.saving = true;
            this.status = config.saving;
            this.refresh();
            try {
                const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
                    document.querySelector('input[name="_csrf_token"]')?.value;
                if (!csrfToken) throw new Error(config.saveError);
                const response = await fetch(config.saveUrl, {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json',
                        'x-csrf-token': csrfToken },
                    body: JSON.stringify({ revision: config.revision, chapter_index: this.chapter, tree: editor.tree })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || config.saveError);
                chapters[this.chapter] = { ...chapters[this.chapter], ...editor.tree };
                editor = createChapterEditor(chapters[this.chapter]);
                this.dirty = false;
                window.location.assign(result.url);
            } catch (error) {
                console.error('Chapter save failed:', error);
                this.status = error.message || config.saveError;
                this.saving = false;
                this.refresh();
            }
        }
    };
});

window.Alpine = Alpine;
Alpine.start();
