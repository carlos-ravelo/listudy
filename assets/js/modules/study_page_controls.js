import { setupChapterPicker } from './chapter_picker.js';
import { hasBlockingUi } from './blocking_ui.js';

export function setupStudyNavigation({ getCurrentChapter, goBack, goForward, progressLabels = { unpracticed: 'Not practiced', practiced: 'Moves practiced', needsPractice: 'Needs practice', reviewDue: 'Review due' } }) {
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
    const update = () => picker.update();
    window.addEventListener('study-progress-updated', event => {
        summaries = new Map(event.detail.map(chapter => [chapter.index, chapter]));
        update();
    });
    function choose(index) {
        if (index < 0 || index >= select.options.length) return;
        select.selectedIndex = index;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.getElementById('btn_random_chapter').onclick = event => {
        event.preventDefault();
        const count = select.options.length;
        if (count > 1) choose((select.selectedIndex + 1 + Math.floor(Math.random() * (count - 1))) % count);
    };
    let copyTimer;
    const originalCopyText = copy.textContent;
    copy.onclick = async event => {
        event.preventDefault();
        const chapter = getCurrentChapter();
        if (!chapter) return;
        try {
            await navigator.clipboard.writeText(chapter.pgn);
            copy.textContent = 'PGN copied to clipboard!';
            clearTimeout(copyTimer);
            copyTimer = setTimeout(() => { copy.textContent = originalCopyText; }, 2500);
        } catch (error) { console.error('Clipboard copy failed:', error); }
    };
    document.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
            hasBlockingUi() ||
            event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); goBack(); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); goForward(); }
    });
    update();
    return { update };
}

export function setupStudyMoveNavigation({ goBack, goForward, getState }) {
    const previous = document.getElementById('study_previous_move');
    const next = document.getElementById('study_next_move');
    function update() {
        const { canGoBack, canGoForward } = getState();
        if (previous) previous.disabled = !canGoBack;
        if (next) next.disabled = !canGoForward;
    }
    if (previous) previous.onclick = () => { goBack(); update(); };
    if (next) next.onclick = () => { goForward(); update(); };
    window.addEventListener('study-spaced-run-updated', update);
    update();
    return { update };
}

export function setupPuzzleRun(i18n, { initialMode } = {}) {
    setupStudyToolsMenu();
    setupStudyDialogs();
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
    if (read) read.onclick = () => {
        if (!reading) window.dispatchEvent(new CustomEvent('study-reading-change', { detail: { reading: true } }));
    };
    smart.onclick = () => { if (reading || sparring || mode !== 'smart') choose('smart'); };
    lines.onclick = () => choose(localStorage.getItem('fullLineRunMode') || 'off');
    order.onchange = () => choose(order.value);
    stop.onclick = () => choose('off');
    window.addEventListener('study-puzzle-run-off', () => {
        mode = 'off';
        localStorage.setItem('puzzleRunMode', mode);
        update();
    });
    window.addEventListener('study-reading-updated', event => {
        reading = event.detail.reading;
        update();
    });
    window.addEventListener('study-sparring-updated', event => {
        sparring = event.detail.active;
        update();
    });
    window.addEventListener('study-visualization-updated', event => {
        visualization = event.detail.active;
        update();
    });
    update();
    return { setMode: choose };
}

export function setupStudyToolsMenu() {
    const menu = document.getElementById('study_more_actions');
    if (!menu || menu.dataset.initialized) return;
    menu.dataset.initialized = 'true';
    const summary = menu.querySelector('summary');
    menu.addEventListener('click', event => {
        if (event.target.closest('a, button')) {
            menu.open = false;
            summary.focus();
        }
    }, true);
    document.addEventListener('click', event => {
        if (!menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menu.open) {
            event.preventDefault();
            menu.open = false;
            summary.focus();
        }
    });
}

export function setupStudySettingsTabs() {
    const dialog = document.getElementById('study_settings_dialog');
    if (!dialog || dialog.dataset.tabsInitialized) return;
    dialog.dataset.tabsInitialized = 'true';
    const tabs = [...dialog.querySelectorAll('[data-settings-tab]:not([hidden])')];
    const panels = [...dialog.querySelectorAll('[data-settings-panel]')];
    function select(tab, focus = false) {
        for (const item of tabs) {
            item.setAttribute('aria-selected', String(item === tab));
            item.tabIndex = item === tab ? 0 : -1;
        }
        for (const panel of panels) panel.hidden = panel.dataset.settingsPanel !== tab.dataset.settingsTab;
        if (focus) tab.focus();
    }
    for (const [index, tab] of tabs.entries()) {
        tab.addEventListener('click', () => select(tab));
        tab.addEventListener('keydown', event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
            if (next === null) return;
            event.preventDefault(); select(tabs[next], true);
        });
    }
    dialog.addEventListener('study-settings-select', event => {
        const tab = tabs.find(tab => tab.dataset.settingsTab === event.detail);
        if (tab) select(tab);
    });
}

export function setupStudyDialogs() {
    setupStudySettingsTabs();
    const returnFocus = new Map();
    for (const opener of document.querySelectorAll?.('[data-study-dialog]') || []) {
        const dialog = document.getElementById(opener.dataset.studyDialog);
        if (!dialog || opener.dataset.dialogInitialized) continue;
        opener.dataset.dialogInitialized = 'true';
        opener.addEventListener('click', () => {
            returnFocus.set(dialog, opener.closest('details')?.querySelector('summary') || opener);
            if (opener.dataset.studyComments) {
                const discussion = dialog.querySelector('#study_discussion');
                if (discussion) discussion.open = true;
            }
            if (dialog.id === 'study_settings_dialog') {
                const section = document.getElementById('practice_sparring')?.getAttribute('aria-pressed') === 'true' ? 'sparring'
                    : document.getElementById('study_mode')?.getAttribute('aria-pressed') === 'true' ? 'general' : 'practice';
                dialog.dispatchEvent(new CustomEvent('study-settings-select', { detail: section }));
            }
            if (!dialog.open) dialog.showModal();
        });
        if (dialog.dataset.initialized) continue;
        dialog.dataset.initialized = 'true';
        dialog.addEventListener('close', () => returnFocus.get(dialog)?.focus());
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const bounds = dialog.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right ||
                event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
        });
    }
}
