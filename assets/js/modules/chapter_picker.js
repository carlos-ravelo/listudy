export function setupChapterPicker({ title, list, previous, next, getOptions, getSelectedIndex, onSelect,
    isDisabled = () => false, renderBadge, searchLabel = 'Search chapter', emptyLabel = 'No chapters' }) {
    if (!title || !list) return { update() {}, destroy() {} };
    const label = document.createElement('span');
    label.className = 'chapter-current-label';
    const badge = document.createElement('span');
    title.replaceChildren(label, ...(renderBadge ? [badge] : []));
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = searchLabel;
    search.setAttribute('aria-label', searchLabel);
    search.className = 'chapter-search';
    list.replaceChildren(search);
    let labels = [], items = [];
    function close() {
        list.hidden = true;
        title.setAttribute('aria-expanded', 'false');
    }
    function choose(index) {
        if (isDisabled() || index < 0 || index >= labels.length) return;
        onSelect(index);
        update();
    }
    function filter() {
        items.forEach((item, index) => { item.hidden = !labels[index].toLowerCase().includes(search.value.toLowerCase()); });
    }
    function update() {
        const options = getOptions();
        if (JSON.stringify(options) !== JSON.stringify(labels)) {
            labels = options;
            items.forEach(item => item.remove());
            items = labels.map((text, index) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'chapter-choice';
                const name = document.createElement('span');
                name.className = 'chapter-choice-label';
                name.textContent = `${index + 1}. ${text}`;
                item.append(name);
                if (renderBadge) item.append(document.createElement('span'));
                item.onclick = () => { choose(index); close(); title.focus(); };
                list.append(item);
                return item;
            });
            filter();
        }
        const index = getSelectedIndex();
        const disabled = isDisabled();
        title.disabled = disabled || !labels.length;
        label.textContent = labels[index] === undefined ? emptyLabel : `${index + 1} / ${labels.length} · ${labels[index]}`;
        if (renderBadge) {
            renderBadge(badge, index);
            badge.classList.add('chapter-current-status');
            badge.hidden = labels[index] === undefined;
        }
        items.forEach((item, i) => {
            item.classList.toggle('chapter-active', i === index);
            item.setAttribute('aria-current', i === index ? 'true' : 'false');
            item.disabled = disabled;
            if (renderBadge) renderBadge(item.lastElementChild, i);
        });
        if (previous) previous.disabled = disabled || index <= 0;
        if (next) next.disabled = disabled || index >= labels.length - 1;
        if (disabled) close();
    }
    search.oninput = filter;
    title.onclick = event => {
        event.preventDefault();
        if (!list.hidden) { close(); return; }
        update();
        if (title.disabled) return;
        list.hidden = false;
        title.setAttribute('aria-expanded', 'true');
        search.value = '';
        filter();
        items[getSelectedIndex()]?.scrollIntoView({ block: 'nearest' });
        search.focus();
    };
    if (previous) previous.onclick = event => { event.preventDefault(); choose(getSelectedIndex() - 1); };
    if (next) next.onclick = event => { event.preventDefault(); choose(getSelectedIndex() + 1); };
    const outside = event => { if (!title.contains(event.target) && !list.contains(event.target)) close(); };
    const escape = event => {
        if (event.key === 'Escape' && !list.hidden) { close(); title.focus(); event.preventDefault(); }
    };
    document.addEventListener('click', outside);
    document.addEventListener('keydown', escape);
    close();
    update();
    return { update, destroy() {
        document.removeEventListener('click', outside);
        document.removeEventListener('keydown', escape);
    } };
}
