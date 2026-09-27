export function setupStudyNavigation({ getCurrentChapter, goBack, goForward }) {
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
        item.textContent = option.text;
        item.onclick = () => { choose(index); close(); title.focus(); };
        list.appendChild(item);
        return item;
    });
    function choose(index) {
        if (index < 0 || index >= select.options.length) return;
        select.selectedIndex = index;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function close() { list.hidden = true; title.setAttribute('aria-expanded', 'false'); }
    function update() {
        title.textContent = select.options[select.selectedIndex]?.text || 'No chapters';
        items.forEach((item, index) => item.classList.toggle('chapter-active', index === select.selectedIndex));
        previous.disabled = select.selectedIndex <= 0;
        next.disabled = select.selectedIndex >= select.options.length - 1;
    }
    search.oninput = () => items.forEach(item => { item.hidden = !item.textContent.toLowerCase().includes(search.value.toLowerCase()); });
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
    };
    update();
}
