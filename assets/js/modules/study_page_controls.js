export function setupStudyNavigation({ getCurrentChapter, goBack, goForward, progressLabels = { unpracticed: 'Not practiced', practiced: 'Moves practiced', needsPractice: 'Needs practice', reviewDue: 'Review due' } }) {
    const select = document.getElementById('chapter_select');
    const previous = document.getElementById('prev_chapter_btn');
    const next = document.getElementById('next_chapter_btn');
    const title = document.getElementById('current_chapter_title');
    const list = document.getElementById('custom_chapter_list');
    const copy = document.getElementById('copy_line_to_clipboard');
    if (!select || !title || !list) return { update() {} };
    const currentLabel = document.createElement('span');
    currentLabel.className = 'chapter-current-label';
    const currentBadge = document.createElement('span');
    title.replaceChildren(currentLabel, currentBadge);
    let summaries = new Map();
    function renderBadge(badge, chapter) {
        const tone = chapter ? chapter.pickerTone : 'new';
        badge.className = `chapter-choice-status chapter-choice-status--${tone}` +
            (badge === currentBadge ? ' chapter-current-status' : '');
        badge.textContent = chapter
            ? (chapter.reviewDue ? progressLabels.reviewDue + ' · ' : chapter.mastered ? '✓ ' : '') + chapter.pickerMetrics
            : progressLabels.unpracticed;
        badge.title = chapter ? chapter.metrics + ' · ' + chapter.recovery : '';
        badge.hidden = false;
    }
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search chapter...';
    search.className = 'chapter-search';
    search.setAttribute('aria-label', 'Search chapter');
    list.replaceChildren(search);
    const items = Array.from(select.options).map((option, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'chapter-choice';
        const label = document.createElement('span');
        label.className = 'chapter-choice-label';
        label.textContent = `${index + 1}. ${option.text}`;
        const status = document.createElement('span');
        status.className = 'chapter-choice-status';
        status.hidden = true;
        item.append(label, status);
        item.onclick = () => { choose(index); close(); title.focus(); };
        list.appendChild(item);
        return item;
    });
    window.addEventListener('study-progress-updated', event => {
        summaries = new Map(event.detail.map(chapter => [chapter.index, chapter]));
        items.forEach((item, index) => {
            const badge = item.querySelector('.chapter-choice-status');
            renderBadge(badge, summaries.get(index));
        });
        renderBadge(currentBadge, summaries.get(select.selectedIndex));
    });
    function choose(index) {
        if (index < 0 || index >= select.options.length) return;
        select.selectedIndex = index;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function close() { list.hidden = true; title.setAttribute('aria-expanded', 'false'); }
    function update() {
        const selected = select.options[select.selectedIndex];
        currentLabel.textContent = selected
            ? `${select.selectedIndex + 1} / ${select.options.length} · ${selected.text}`
            : 'No chapters';
        renderBadge(currentBadge, summaries.get(select.selectedIndex));
        currentBadge.hidden = !selected;
        items.forEach((item, index) => item.classList.toggle('chapter-active', index === select.selectedIndex));
        previous.disabled = select.selectedIndex <= 0;
        next.disabled = select.selectedIndex >= select.options.length - 1;
    }
    search.oninput = () => items.forEach(item => {
        item.hidden = !item.querySelector('.chapter-choice-label').textContent.toLowerCase().includes(search.value.toLowerCase());
    });
    title.onclick = event => {
        event.preventDefault();
        if (!list.hidden) { close(); return; }
        list.hidden = false;
        title.setAttribute('aria-expanded', 'true');
        search.value = '';
        search.oninput();
        items[select.selectedIndex]?.scrollIntoView({ block: 'nearest' });
        search.focus();
    };
    previous.onclick = event => { event.preventDefault(); choose(select.selectedIndex - 1); };
    next.onclick = event => { event.preventDefault(); choose(select.selectedIndex + 1); };
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
    document.addEventListener('click', event => {
        if (!title.contains(event.target) && !list.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !list.hidden) { close(); title.focus(); return; }
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
            event.target.closest('input, textarea, select, [contenteditable="true"]') ||
            !document.getElementById('collection_modal').hidden) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); goBack(); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); goForward(); }
    });
    close();
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

export function setupPuzzleRun(i18n) {
    const button = document.getElementById('puzzle_run');
    if (!button) return;
    const modes = ['off', 'next', 'random'];
    let mode = localStorage.getItem('puzzleRunMode') || 'off';
    if (!modes.includes(mode)) mode = 'off';
    const update = () => { button.textContent = i18n[`puzzle_run_${mode}`]; };
    button.onclick = event => {
        event.preventDefault();
        mode = modes[(modes.indexOf(mode) + 1) % modes.length];
        localStorage.setItem('puzzleRunMode', mode);
        update();
        window.dispatchEvent(new Event('study-puzzle-run-changed'));
    };
    window.addEventListener('study-puzzle-run-off', () => {
        mode = 'off';
        localStorage.setItem('puzzleRunMode', mode);
        update();
    });
    update();
}
