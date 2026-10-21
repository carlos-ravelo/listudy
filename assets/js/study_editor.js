import { Chessground } from 'chessground';
import { createChapterEditor } from './modules/study/chapter_editor.js';
import { lichessAnalysisUrl, prepareLichessAnalysis } from './modules/study/lichess_analysis.js';
import { setupStudyMoveTree } from './modules/study/study_move_tree.js';
import { ground_legal_moves } from './modules/chess_utils.js';
import { createPromotionPicker } from './modules/promotion_picker.js';
import { setupPositionFen } from './modules/study/position_setup.js';
import { createSparringEngine } from './modules/sparring/uci_engine.js';
import { enginePosition } from './modules/engine_position.js';
import { setupChapterPicker } from './modules/chapter_picker.js';
const ChessModule = require('chess.js');
const Chess = ChessModule.Chess || ChessModule;

import Alpine from 'alpinejs';

Alpine.data('chapterEditor', () => {
    let currentChapter, editor, ground, moveTree, config, pgnSnapshot, analysisPgn, promotionPicker, engine, analysisId = 0;

    let chapterRequest = 0, chapterAbort, chapterPicker;

    return {
        exportPgn: '', pgnEdited: false, options: [], chapter: 0, title: '', comment: '', pendingPromotion: null, analysisUrl: '',
        editingTitle: false, titleBeforeEdit: '', saving: false, loading: false, dirty: false, hasPrevious: false, hasNext: false, status: '',
        draft: false, trainingKind: 'repertoire', studyColor: 'white', privateStudy: true,
        setupMode: false, selectedPiece: 'wP', positionTurn: 'w', setupPieces: [],
        analysisEnabled: false, analysisText: '',
        canUndo: false, canRedo: false, canPromote: false, annotation: 0,

        init() {
            config = this.$el.dataset;
            this.draft = config.draft === 'true';
            this.trainingKind = config.kind || 'repertoire';
            this.studyColor = config.color || 'white';
            this.setupPieces = ['♙♘♗♖♕♔', '♟♞♝♜♛♚'].flatMap((symbols, i) => [...symbols].map((symbol, j) => ({
                code: (i ? 'b' : 'w') + 'PNBRQK'[j], symbol, label: (i ? config.black : config.white) + ' ' + (config.pieceNames || 'Pawn,Knight,Bishop,Rook,Queen,King').split(',')[j]
            }))).concat([{code: 'erase', symbol: '×', label: config.removePiece}]);
            const initial = JSON.parse(config.editor);
            delete config.editor;
            this.options = initial.chapters.map(({ title }) => ({ title }));
            const requested = new URLSearchParams(window.location.search).get('chapter_index');
            this.chapter = initial.chapter_index ?? (requested !== null && /^\d+$/.test(requested) && Number(requested) < initial.chapters.length
                ? Number(requested) : 0);
            currentChapter = initial.chapter || initial.chapters[this.chapter];
            editor = createChapterEditor(currentChapter);
            promotionPicker = createPromotionPicker({ element: this.$refs.promotionPicker,
                onChoose: role => this.choosePromotion(role), onCancel: () => this.cancelPromotion() });
            ground = Chessground(this.$refs.board, {
                orientation: config.color === 'black' ? 'black' : 'white',
                drawable: { enabled: false },
                movable: { free: false, events: { after: (from, to) => this.play(from, to) } },
                events: {select: square => this.placePiece(square)}
            });
            moveTree = setupStudyMoveTree({
                element: this.$refs.moves,
                startLabel: config.start,
                variationLabel: config.variation,
                promoteLabel: config.promote,
                onPromote: path => this.promoteVariation(path),
                onSelect: path => this.selectPosition(path)
            });
            if (this.$refs.chapterTitle) chapterPicker = setupChapterPicker({
                title: this.$refs.chapterTitle, list: this.$refs.chapterList,
                getOptions: () => this.options.map(option => option.title),
                getSelectedIndex: () => this.chapter,
                isDisabled: () => this.draft || this.setupMode || this.pendingPromotion || this.saving || this.loading,
                searchLabel: config.searchChapter,
                onSelect: index => this.changeChapter({ target: { value: String(index) } })
            });
            this.refresh();
        },

        destroy() { ++chapterRequest; chapterAbort?.abort(); ++analysisId; chapterPicker?.destroy(); engine?.dispose(); promotionPicker?.destroy(); ground?.destroy(); },

        beginSetup() {
            if ((this.dirty || this.pgnEdited) && !window.confirm(config.discardPrompt)) return;
            ++analysisId; engine?.cancel();
            this.analysisEnabled = false;
            this.setupMode = true;
            chapterPicker?.update();
            this.positionTurn = editor.position().turn();
            ground.set({movable: {color: undefined, dests: new Map()}, draggable: {enabled: false}, lastMove: undefined, check: false});
        },
        placePiece(square) {
            if (!this.setupMode || !square) return;
            const roles = {P:'pawn', N:'knight', B:'bishop', R:'rook', Q:'queen', K:'king'};
            ground.setPieces(new Map([[square, this.selectedPiece === 'erase' ? undefined : {
                role: roles[this.selectedPiece[1]], color: this.selectedPiece[0] === 'w' ? 'white' : 'black'
            }]]));
        },
        clearPosition() { ground.set({fen: '8/8/8/8/8/8/8/8'}); },
        resetPosition() { ground.set({fen: new Chess().fen()}); this.positionTurn = 'w'; },
        cancelSetup() {
            this.setupMode = false;
            ground.set({draggable: {enabled: true}});
            this.status = '';
            this.refresh();
        },
        finishSetup() {
            try {
                const fen = setupPositionFen(ground.getFen(), this.positionTurn);
                const initial = {...currentChapter, fen, root: [], comment: '', headers: {SetUp: '1', FEN: fen, Result: '*'}};
                currentChapter = initial;
                editor = createChapterEditor(initial);
                this.setupMode = false;
                ground.set({draggable: {enabled: true}});
                this.status = '';
                this.refresh();
            } catch (_) { this.status = config.invalidPosition; }
        },
        toggleAnalysis() {
            this.analysisEnabled = !this.analysisEnabled;
            if (!this.analysisEnabled) { ++analysisId; engine?.cancel(); }
            else this.analyzePosition();
        },
        async analyzePosition() {
            const id = ++analysisId;
            engine?.cancel();
            if (!this.analysisEnabled || this.setupMode || this.loading) return;
            const position = editor.position();
            this.analysisText = config.analysing;
            try {
                engine ||= createSparringEngine();
                const result = await engine.analyze(enginePosition(currentChapter.fen, position), {movetime: 800});
                if (id !== analysisId || !this.analysisEnabled) return;
                const score = result.score;
                const white = score?.value * (position.turn() === 'w' ? 1 : -1);
                const value = score?.type === 'mate' ? `M${white}` : Number.isFinite(white) ? `${white >= 0 ? '+' : ''}${(white / 100).toFixed(1)}` : '';
                const line = [];
                for (const uci of (result.pv || []).slice(0, 6)) {
                    const move = position.move({from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4]});
                    if (!move) break;
                    line.push(move.san);
                }
                this.analysisText = [value, line.join(' ')].filter(Boolean).join(' · ');
            } catch (_) { if (id === analysisId) this.analysisText = config.engineError; }
        },

        syncPgn(force = false) {
            this.canUndo = editor.canUndo;
            this.canRedo = editor.canRedo;
            this.canPromote = editor.canPromote;
            const snapshot = JSON.stringify([this.chapter, editor.tree]);
            if (force || snapshot !== pgnSnapshot) {
                analysisPgn = editor.pgn();
                this.exportPgn = analysisPgn;
                this.pgnEdited = false;
                pgnSnapshot = snapshot;
            }
            this.analysisUrl = lichessAnalysisUrl(analysisPgn, ground.state.orientation, editor.position().fen(), editor.path);
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
            this.annotation = this.hasPrevious ? (editor.node().nags || []).find(nag => nag >= 1 && nag <= 6) || 0 : 0;
            this.hasNext = (this.hasPrevious ? editor.node().children : editor.tree.root).length > 0;
            ground.set({
                fen: position.fen(), turnColor: color, check: position.in_check(),
                lastMove: move ? [move.from, move.to] : undefined,
                movable: { color: (this.saving || this.loading || this.pendingPromotion) ? undefined : color, dests: (this.saving || this.loading || this.pendingPromotion) ? new Map() : ground_legal_moves(position) }
            });
            moveTree.update({ reading: true, chapter: this.chapter, root: editor.tree.root,
                fen: currentChapter.fen, path: editor.path,
                editingDisabled: this.setupMode || this.saving || this.loading || !!this.pendingPromotion });
            chapterPicker?.update();
            if (this.analysisEnabled) this.analyzePosition();
        },

        prepareAnalysis() { prepareLichessAnalysis(editor.pgn(), config.importPrompt); },

        play(from, to, promotion) {
            if (this.setupMode || this.saving || this.loading || this.pendingPromotion) return;
            const position = editor.position();
            const choices = position.moves({ verbose: true }).filter(move => move.from === from && move.to === to && move.promotion);
            if (choices.length && !promotion) {
                this.pendingPromotion = { from, to };
                this.refresh();
                promotionPicker.open({ to, color: position.turn() === 'w' ? 'white' : 'black', orientation: ground.state.orientation });
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
            promotionPicker.close();
            this.pendingPromotion = null;
            this.play(move.from, move.to, role);
            this.$refs.board.focus();
        },

        cancelPromotion() {
            if (!this.pendingPromotion) return;
            promotionPicker.close();
            this.pendingPromotion = null;
            this.refresh();
            this.$refs.board.focus();
        },

        selectPosition(path) {
            if (this.setupMode || this.saving || this.loading || this.pendingPromotion) return;
            editor.select(path);
            this.refresh();
        },
        previous() { this.selectPosition(editor.path.slice(0, -1)); },
        next() { this.selectPosition([...editor.path, 0]); },

        applyEdit(operation, ...args) {
            if (this.setupMode || this.saving || this.loading || this.pendingPromotion) return;
            if (this.pgnEdited && !window.confirm(config.discardPrompt)) return;
            if (!editor[operation](...args)) return;
            this.editingTitle = false;
            this.syncPgn(true);
            this.status = editor.dirty ? config.unsaved : '';
            this.refresh();
        },
        deleteFromHere() { this.applyEdit('deleteFromHere'); },
        undo() { this.applyEdit('undo'); },
        redo() { this.applyEdit('redo'); },
        promoteVariation(path) { this.applyEdit('promoteVariation', path); },
        setAnnotation(value) { this.applyEdit('setAnnotation', Number(value)); },

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
            if (this.setupMode || this.saving || this.loading || event.defaultPrevented || event.isComposing || event.altKey) return;
            if (event.target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
            if (event.ctrlKey || event.metaKey) {
                const key = event.key.toLowerCase();
                if (key === 'z' || key === 'y') {
                    event.preventDefault();
                    if (key === 'y' || event.shiftKey) this.redo();
                    else this.undo();
                }
                return;
            }
            if (event.shiftKey) return;
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
            if (this.saving || this.loading || this.pendingPromotion) return;
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
            if (this.setupMode || this.saving || this.loading || this.pendingPromotion) return;
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
            if (this.setupMode || this.saving || this.loading || this.pendingPromotion) return;
            if (!window.confirm(config.discardPrompt)) return;
            editor = createChapterEditor(currentChapter);
            this.syncPgn(true);
            this.status = '';
            this.refresh();
        },

        async changeChapter(event) {
            const index = Number(event.target.value);
            if (this.setupMode || this.pendingPromotion || this.saving || this.draft ||
                !Number.isInteger(index) || index < 0 || index >= this.options.length) {
                event.target.value = String(this.chapter);
                return;
            }
            if ((this.dirty || this.pgnEdited) && !window.confirm(config.discardPrompt)) {
                event.target.value = String(this.chapter);
                return;
            }
            chapterAbort?.abort();
            const request = ++chapterRequest;
            if (index === this.chapter) {
                this.loading = false;
                this.status = '';
                this.refresh();
                return;
            }
            chapterAbort = new AbortController();
            this.loading = true;
            ++analysisId; engine?.cancel();
            this.status = config.loading;
            this.refresh();
            try {
                const url = new URL(config.loadUrl, window.location.href);
                url.searchParams.set('chapter_index', String(index));
                url.searchParams.set('revision', config.revision);
                const response = await fetch(url, {credentials: 'same-origin', signal: chapterAbort.signal});
                const result = await response.json();
                if (request !== chapterRequest) return;
                if (!response.ok) throw new Error(result.error || config.loadError);
                if (result.revision !== config.revision || result.editor?.chapter_index !== index) throw new Error(config.loadError);
                const next = createChapterEditor(result.editor.chapter);
                currentChapter = result.editor.chapter;
                editor = next;
                this.chapter = index;
                this.options = result.editor.chapters.map(({title}) => ({title}));
                this.editingTitle = false;
                this.syncPgn(true);
                this.status = '';
            } catch (error) {
                if (request !== chapterRequest) return;
                this.status = error.message || config.loadError;
                event.target.value = String(this.chapter);
            } finally {
                if (request === chapterRequest) {
                    this.loading = false;
                    this.refresh();
                }
            }
        },

        beforeLeave(event) {
            if (!this.dirty && !this.pgnEdited && !this.setupMode) return;
            event.preventDefault();
            event.returnValue = '';
        },

        async save() {
            if (this.setupMode || this.saving || this.loading || this.pendingPromotion || !this.dirty) return;
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
                    body: JSON.stringify(this.draft ? {draft: {title: editor.tree.title, training_kind: this.trainingKind,
                        color: this.studyColor, private: this.privateStudy, pgn: editor.pgn()}} :
                        { revision: config.revision, chapter_index: this.chapter, tree: editor.tree })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || config.saveError);
                if (this.draft) { this.dirty = false; this.pgnEdited = false; window.location.assign(result.url); return; }
                config.revision = result.revision;
                currentChapter = JSON.parse(JSON.stringify({ ...currentChapter, ...editor.tree }));
                editor.markSaved();
                this.options[this.chapter].title = currentChapter.title;
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
