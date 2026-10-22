import { createPageScope } from './page_scope.js';
import { setupChapterPicker } from './chapter_picker.js';
import { hasBlockingUi } from './blocking_ui.js';
import { isEditableTarget } from './editable_target.js';

export function setupStudyNavigation({ getCurrentChapter, goBack, goForward, progressLabels = { unpracticed: 'Not practiced', practiced: 'Moves practiced', needsPractice: 'Needs practice', reviewDue: 'Review due' } }) {
    const scope = createPageScope();
    const select = document.getElementById('chapter_select');
    const previous = document.getElementById('prev_chapter_btn');
    const next = document.getElementById('next_chapter_btn');
    const title = document.getElementById('current_chapter_title');
    const list = document.getElementById('custom_chapter_list');
    const copy = document.getElementById('copy_line_to_clipboard');
    if (!select || !title || !list) return { update() {} };
    let summaries = new Map();
    function renderBadge(badge, index) {
        const chapter = summaries.get(index);
        badge.className = `chapter-choice-status chapter-choice-status--${chapter?.pickerTone || 'new'}`;
        badge.textContent = chapter
            ? (chapter.reviewDue && !chapter.dueContinuations ? progressLabels.reviewDue + ' · ' : '') + chapter.pickerMetrics
            : progressLabels.unpracticed;
        badge.title = chapter ? chapter.progressTooltip || chapter.metrics + ' · ' + chapter.recovery : '';
    }
    const picker = setupChapterPicker({
        title, list, previous, next,
        getOptions: () => Array.from(select.options, option => option.text),
        getSelectedIndex: () => select.selectedIndex,
        onSelect: choose, renderBadge
    });
    scope.use(picker);
    const update = () => picker.update();
    scope.listen(window, 'study-progress-updated', event => {
        summaries = new Map(event.detail.map(chapter => [chapter.index, chapter]));
        update();
    });
    function choose(index) {
        if (index < 0 || index >= select.options.length) return;
        select.selectedIndex = index;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    scope.assign(document.getElementById('btn_random_chapter'), 'onclick', event => {
        event.preventDefault();
        const count = select.options.length;
        if (count > 1) choose((select.selectedIndex + 1 + Math.floor(Math.random() * (count - 1))) % count);
    });
    let copyTimer;
    const originalCopyText = copy.textContent;
    scope.use(() => { copy.textContent = originalCopyText; });
    scope.assign(copy, 'onclick', async event => {
        event.preventDefault();
        const chapter = getCurrentChapter();
        if (!chapter) return;
        try {
            await navigator.clipboard.writeText(chapter.pgn);
            if (!scope.active) return;
            copy.textContent = 'PGN copied to clipboard!';
            scope.clearTimeout(copyTimer);
            copyTimer = scope.timeout(() => { copy.textContent = originalCopyText; }, 2500);
        } catch (error) { console.error('Clipboard copy failed:', error); }
    });
    scope.listen(document, 'keydown', event => {
        if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey ||
            hasBlockingUi() ||
            isEditableTarget(event.target)) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); goBack(); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); goForward(); }
    });
    update();
    return { update, destroy: scope.destroy };
}

export function setupStudyMoveNavigation({ goBack, goForward, getState }) {
    const scope = createPageScope();
    const previous = document.getElementById('study_previous_move');
    const next = document.getElementById('study_next_move');
    function update() {
        const { canGoBack, canGoForward } = getState();
        if (previous) previous.disabled = !canGoBack;
        if (next) next.disabled = !canGoForward;
    }
    if (previous) scope.assign(previous, 'onclick', () => { goBack(); update(); });
    if (next) scope.assign(next, 'onclick', () => { goForward(); update(); });
    scope.listen(window, 'study-spaced-run-updated', update);
    update();
    return { update, destroy: scope.destroy };
}

export function setupPuzzleRun(i18n, { initialMode } = {}) {
    const scope = createPageScope();
    scope.use(setupStudyToolsMenu());
    const order = document.getElementById('puzzle_run');
    const smart = document.getElementById('practice_smart');
    const lines = document.getElementById('practice_lines');
    const read = document.getElementById('study_mode');
    if (!order || !smart || !lines) return;
    const orderControl = document.getElementById('line_order_control');
    const stop = document.getElementById('stop_smart_run');
    const modes = ['off', 'next', 'random', 'smart'];
    let mode = initialMode ?? localStorage.getItem('puzzleRunMode') ?? 'off';
    if (!modes.includes(mode)) mode = 'off';
    let reading = false;
    let sparring = false;
    let visualization = false;
    const update = () => {
        window.studyPuzzleRunMode = mode;
        window.studyFullLines = mode !== 'smart';
        read?.setAttribute('aria-pressed', String(reading));
        smart.setAttribute('aria-pressed', String(!reading && !sparring && mode === 'smart'));
        lines.setAttribute('aria-pressed', String(!reading && !sparring && mode !== 'smart'));
        order.value = mode === 'smart' ? localStorage.getItem('fullLineRunMode') || 'off' : mode;
        orderControl.hidden = reading || sparring || visualization || mode === 'smart';
        stop.hidden = reading || sparring || mode !== 'smart';
        smart.disabled = false;
        lines.disabled = false;
    };
    const choose = (next, { persist = true, notify = true } = {}) => {
        if (!modes.includes(next)) return;
        mode = next;
        if (persist) {
            localStorage.setItem('puzzleRunMode', mode);
            if (mode !== 'smart') localStorage.setItem('fullLineRunMode', mode);
        }
        update();
        if (notify) window.dispatchEvent(new Event('study-puzzle-run-changed'));
    };
    if (read) scope.assign(read, 'onclick', () => {
        if (!reading) window.dispatchEvent(new CustomEvent('study-reading-change', { detail: { reading: true } }));
    });
    scope.assign(smart, 'onclick', () => { if (reading || sparring || mode !== 'smart') choose('smart'); });
    scope.assign(lines, 'onclick', () => choose(localStorage.getItem('fullLineRunMode') || 'off'));
    scope.assign(order, 'onchange', () => choose(order.value));
    scope.assign(stop, 'onclick', () => choose('off'));
    scope.listen(window, 'study-puzzle-run-off', () => {
        mode = 'off';
        localStorage.setItem('puzzleRunMode', mode);
        update();
    });
    scope.listen(window, 'study-reading-updated', event => {
        reading = event.detail.reading;
        update();
    });
    scope.listen(window, 'study-sparring-updated', event => {
        sparring = event.detail.active;
        update();
    });
    scope.listen(window, 'study-visualization-updated', event => {
        visualization = event.detail.active;
        update();
    });
    update();
    return { setMode: choose, destroy: scope.destroy };
}

export function setupStudyToolsMenu() {
    const scope = createPageScope();
    const menu = document.getElementById('study_more_actions');
    if (!menu || menu.dataset.initialized) return;
    menu.dataset.initialized = 'true';
    scope.use(() => { delete menu.dataset.initialized; });
    const summary = menu.querySelector('summary');
    scope.listen(menu, 'click', event => {
        if (event.target.closest('a, button')) {
            menu.open = false;
            summary.focus();
        }
    }, true);
    scope.listen(document, 'click', event => {
        if (!menu.contains(event.target)) menu.open = false;
    });
    scope.listen(document, 'keydown', event => {
        if (event.key === 'Escape' && menu.open) {
            event.preventDefault();
            menu.open = false;
            summary.focus();
        }
    });
    return { destroy: scope.destroy };
}
