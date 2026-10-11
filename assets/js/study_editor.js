import { Chessground } from 'chessground';
import { createChapterEditor } from './modules/study/chapter_editor.js';
import { setupStudyMoveTree } from './modules/study/study_move_tree.js';
import { ground_legal_moves } from './modules/chess_utils.js';

import Alpine from 'alpinejs';

Alpine.data('chapterEditor', () => {
    let chapters, editor, ground, moveTree, config, pgnSnapshot;

    return {
        exportPgn: '', pgnEdited: false, options: [], chapter: 0, title: '', comment: '', pendingPromotion: null, promotionColor: 'white', promotionLeft: '0%', promotionBottom: false, analysisUrl: '',
        editingTitle: false, titleBeforeEdit: '', saving: false, dirty: false, hasPrevious: false, hasNext: false, status: '',

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

        syncPgn(force = false) {
            const snapshot = JSON.stringify([this.chapter, editor.tree]);
            if (force || snapshot !== pgnSnapshot) {
                this.exportPgn = editor.pgn();
                this.pgnEdited = false;
                pgnSnapshot = snapshot;
            }
        },

        refresh() {
            this.syncPgn();
            const position = editor.position();
            const color = position.turn() === 'w' ? 'white' : 'black';
            const move = position.history({ verbose: true }).slice(-1)[0];
            this.comment = editor.node().comment;
            this.title = editor.tree.title;
            this.dirty = editor.dirty;
            this.hasPrevious = editor.path.length > 0;
            this.hasNext = (this.hasPrevious ? editor.node().children : editor.tree.root).length > 0;
            ground.set({
                fen: position.fen(), turnColor: color, check: position.in_check(),
                lastMove: move ? [move.from, move.to] : undefined,
                movable: { color: (this.saving || this.pendingPromotion) ? undefined : color, dests: (this.saving || this.pendingPromotion) ? new Map() : ground_legal_moves(position) }
            });
            const orientation = ground.state.orientation;
            const customStart = position.header().SetUp !== undefined;
            this.analysisUrl = customStart
                ? `https://lichess.org/analysis/${position.fen()}?color=${orientation}`
                : `https://lichess.org/analysis/pgn/${encodeURIComponent(position.pgn())}?color=${orientation}`;
            moveTree.update({ reading: true, chapter: this.chapter, root: editor.tree.root,
                fen: chapters[this.chapter].fen, path: editor.path });
        },

        play(from, to, promotion) {
            if (this.saving || this.pendingPromotion) return;
            const position = editor.position();
            const choices = position.moves({ verbose: true }).filter(move => move.from === from && move.to === to && move.promotion);
            if (choices.length && !promotion) {
                this.pendingPromotion = { from, to };
                this.promotionColor = position.turn() === 'w' ? 'white' : 'black';
                const flipped = ground.state.orientation === 'black';
                const file = to.charCodeAt(0) - 97;
                this.promotionLeft = `${(flipped ? 7 - file : file) * 12.5}%`;
                this.promotionBottom = (to[1] === '1') !== flipped;
                this.refresh();
                this.$nextTick(() => this.$refs.promotionChoices?.querySelector('button')?.focus());
                return;
            }
            try {
                if (!editor.play(from, to, promotion || 'q')) throw new Error('Invalid move');
                this.status = editor.dirty ? config.unsaved : '';
            } catch (_error) {
                this.status = config.invalidMove;
            }
            this.refresh();
        },

        choosePromotion(role) {
            const move = this.pendingPromotion;
            if (!move || !['q', 'n', 'r', 'b'].includes(role)) return;
            this.pendingPromotion = null;
            this.play(move.from, move.to, role);
            this.$refs.board.focus();
        },

        cancelPromotion() {
            if (!this.pendingPromotion) return;
            this.pendingPromotion = null;
            this.refresh();
            this.$refs.board.focus();
        },

        selectPosition(path) {
            if (this.saving || this.pendingPromotion) return;
            editor.select(path);
            this.refresh();
        },
        previous() { this.selectPosition(editor.path.slice(0, -1)); },
        next() { this.selectPosition([...editor.path, 0]); },

        copyCurrentMove(event) {
            if (event.defaultPrevented || !event.clipboardData || window.getSelection()?.toString()) return;
            if (event.target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
            if (!editor.path.length) return;
            const move = this.$refs.moves.querySelector('[aria-current="step"]');
            if (!move) return;
            event.clipboardData.setData('text/plain', move.getAttribute('aria-label'));
            event.preventDefault();
        },

        navigateKey(event) {
            if (this.pendingPromotion) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    this.cancelPromotion();
                }
                return;
            }
            if (this.saving || event.defaultPrevented || event.isComposing ||
                event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            if (event.target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
            if (event.key === 'ArrowLeft' && this.hasPrevious) {
                event.preventDefault();
                this.previous();
            } else if (event.key === 'ArrowRight' && this.hasNext) {
                event.preventDefault();
                this.next();
            }
        },

        updateComment(value) {
            editor.setComment(value);
            this.syncPgn();
            this.dirty = editor.dirty;
            this.status = this.dirty ? config.unsaved : '';
        },

        beginTitleEdit() {
            if (this.saving || this.pendingPromotion) return;
            this.titleBeforeEdit = this.title;
            this.editingTitle = true;
            this.$nextTick(() => {
                this.$refs.titleInput.focus();
                this.$refs.titleInput.select();
            });
        },

        cancelTitleEdit() {
            this.title = this.titleBeforeEdit;
            this.updateTitle(this.title);
            this.editingTitle = false;
        },

        updateTitle(value) {
            editor.setTitle(value);
            this.syncPgn();
            this.dirty = editor.dirty;
            this.status = this.dirty ? config.unsaved : '';
        },

        applyChapterPgn() {
            if (this.saving || this.pendingPromotion) return;
            try {
                editor.loadPgn(this.exportPgn);
                this.syncPgn(true);
                this.editingTitle = false;
                this.status = config.unsaved;
                this.refresh();
            } catch (error) {
                this.status = config[error.message] || config.invalidPgn;
            }
        },

        discard() {
            if (this.pendingPromotion) return;
            if (!window.confirm(config.discardPrompt)) return;
            editor = createChapterEditor(chapters[this.chapter]);
            this.syncPgn(true);
            this.status = '';
            this.refresh();
        },

        changeChapter(event) {
            if (this.pendingPromotion) {
                event.target.value = String(this.chapter);
                return;
            }
            if ((this.dirty || this.pgnEdited) && !window.confirm(config.discardPrompt)) {
                event.target.value = String(this.chapter);
                return;
            }
            this.editingTitle = false;
            this.chapter = Number(event.target.value);
            editor = createChapterEditor(chapters[this.chapter]);
            this.syncPgn(true);
            this.status = '';
            this.refresh();
        },

        beforeLeave(event) {
            if (!this.dirty && !this.pgnEdited) return;
            event.preventDefault();
            event.returnValue = '';
        },

        async save() {
            if (this.saving || this.pendingPromotion || !this.dirty) return;
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
                const path = editor.path;
                config.revision = result.revision;
                chapters[this.chapter] = { ...chapters[this.chapter], ...editor.tree };
                editor = createChapterEditor(chapters[this.chapter]);
                editor.select(path);
                this.options[this.chapter].title = chapters[this.chapter].title;
                this.saving = false;
                this.status = config.saved;
                this.refresh();
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
