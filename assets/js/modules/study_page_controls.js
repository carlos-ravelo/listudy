export function setupStudyNavigation({ getCurrentChapter, goBack, goForward, progressLabels = { one: 'mistake', many: 'mistakes', unpracticed: 'Not practiced', correct: 'correct' } }) {
    const select = document.getElementById('chapter_select');
    const previous = document.getElementById('prev_chapter_btn');
    const next = document.getElementById('next_chapter_btn');
    const title = document.getElementById('current_chapter_title');
    const list = document.getElementById('custom_chapter_list');
    const copy = document.getElementById('copy_line_to_clipboard');
    if (!select || !title || !list) return { update() {} };
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
        const byIndex = new Map(event.detail.map(chapter => [chapter.index, chapter]));
        items.forEach((item, index) => {
            const badge = item.querySelector('.chapter-choice-status');
            const chapter = byIndex.get(index);
            if (!chapter || chapter.attempts === 0) {
                badge.className = 'chapter-choice-status chapter-choice-status--new';
                badge.textContent = progressLabels.unpracticed;
            } else if (chapter.errors > 0) {
                badge.className = 'chapter-choice-status chapter-choice-status--mistakes';
                badge.textContent = `${chapter.errors} ${chapter.errors === 1 ? progressLabels.one : progressLabels.many}`;
            } else {
                badge.className = 'chapter-choice-status chapter-choice-status--' + (chapter.complete ? 'solid' : 'in-progress');
                badge.textContent = `${chapter.complete ? '✓ ' : ''}${chapter.covered}/${chapter.total} ${progressLabels.practiced}`;
            }
            badge.hidden = false;
        });
    });
    function choose(index) {
        if (index < 0 || index >= select.options.length) return;
        select.selectedIndex = index;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function close() { list.hidden = true; title.setAttribute('aria-expanded', 'false'); }
    function update() {
        const selected = select.options[select.selectedIndex];
        title.textContent = selected
            ? `${select.selectedIndex + 1} / ${select.options.length} · ${selected.text}`
            : 'No chapters';
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
