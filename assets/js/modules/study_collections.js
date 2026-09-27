import { CollectionStore } from './study/collection_store.js';

function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export function setupStudyCollections({ getCurrentChapter }) {
    const add = document.getElementById('add_to_collection');
    const manage = document.getElementById('manage_collection');
    const modal = document.getElementById('collection_modal');
    if (!add || !manage || !modal) return { update() {} };
    const list = modal.querySelector('#collection_list');
    const selector = modal.querySelector('#collection_selector');
    const store = new CollectionStore(localStorage);
    let returnFocus;

    function update() {
        try {
            const data = store.read();
            const items = data.collections[data.active];
            const chapter = getCurrentChapter();
            const alreadyAdded = chapter && items.some(item => item.pgn === chapter.pgn);
            const name = data.active.length > 12 ? data.active.slice(0, 12) + '…' : data.active;
            add.textContent = `${alreadyAdded ? 'Already in' : '➕ Add to'} [${name}] (${items.length})`;
            add.classList.toggle('collection-added', Boolean(alreadyAdded));
            add.setAttribute('aria-disabled', String(Boolean(alreadyAdded)));
            manage.hidden = !(Object.keys(data.collections).length > 1 || Object.values(data.collections).some(items => items.length));
        } catch (error) {
            console.error(error);
            add.textContent = 'Collections unavailable';
        }
    }

    function button(text, title, action, disabled = false, highlight = -1) {
        const node = element('button', 'collection-action', text);
        node.type = 'button';
        node.title = title;
        node.disabled = disabled;
        node.addEventListener('click', () => perform(action, highlight));
        return node;
    }

    function render(highlight = -1) {
        const data = store.read();
        selector.replaceChildren();
        Object.keys(data.collections).forEach(name => selector.add(new Option(name, name, false, name === data.active)));
        list.replaceChildren();
        const items = data.collections[data.active];
        if (!items.length) list.appendChild(element('li', 'collection-empty', 'This collection is empty.'));
        let previousStudy;
        items.forEach((item, index) => {
            const study = item.study || 'Unknown Study';
            if (study !== previousStudy) {
                list.appendChild(element('li', 'collection-study', `📘 ${study}`));
                previousStudy = study;
            }
            const row = element('li', 'collection-row');
            row.classList.toggle('collection-highlight', index === highlight);
            const description = element('span', 'collection-description');
            const label = element('span', '', item.title || 'Unnamed Chapter');
            // Legacy collections may lack a source URL. Only link to this site.
            if (item.studyPath && item.studyPath.startsWith('/') && !item.studyPath.startsWith('//')) {
                const url = new URL(item.studyPath, window.location.origin);
                if (url.origin === window.location.origin) {
                    url.searchParams.set('chapter', item.title);
                    if (Number.isInteger(item.chapterIndex)) url.searchParams.set('chapter_index', item.chapterIndex);
                    const link = element('a', '', label.textContent);
                    link.href = url.pathname + url.search;
                    link.target = '_blank';
                    link.rel = 'noopener';
                    description.appendChild(link);
                } else description.appendChild(label);
            } else description.appendChild(label);
            const source = element('span', 'collection-source', ` (${study})`);
            description.appendChild(source);
            row.appendChild(description);
            const actions = element('div', 'collection-actions');
            const otherNames = Object.keys(data.collections).filter(name => name !== data.active);
            if (otherNames.length) {
                const move = element('select', 'collection-move');
                move.title = 'Move to another collection';
                move.add(new Option('📦 Move', ''));
                move.options[0].disabled = true;
                otherNames.forEach(name => move.add(new Option(name, name)));
                move.addEventListener('change', () => perform(() => store.move(index, move.value)));
                actions.appendChild(move);
            }
            actions.appendChild(button('⬆️', 'Move up', () => store.reorder(index, -1), index === 0, index - 1));
            actions.appendChild(button('⬇️', 'Move down', () => store.reorder(index, 1), index === items.length - 1, index + 1));
            actions.appendChild(button('✕', 'Remove chapter', () => store.remove(index)));
            row.appendChild(actions);
            list.appendChild(row);
        });
    }

    function perform(action, highlight = -1) {
        try {
            action();
            if (!modal.hidden) {
                render(highlight);
                if (!modal.contains(document.activeElement)) selector.focus();
            }
            update();
        }
        catch (error) { alert(error.message || 'The collection could not be saved.'); }
    }
    function close() { modal.hidden = true; if (returnFocus) returnFocus.focus(); }
    add.addEventListener('click', event => {
        event.preventDefault();
        perform(() => { const chapter = getCurrentChapter(); if (chapter) store.add(chapter); });
    });
    manage.addEventListener('click', event => {
        event.preventDefault();
        perform(() => { render(); returnFocus = document.activeElement; modal.hidden = false; selector.focus(); });
    });
    selector.addEventListener('change', () => perform(() => store.select(selector.value)));
    modal.querySelector('#btn_new_collection').onclick = () => {
        const name = prompt('Enter a name for the new collection:');
        if (name && name.trim()) perform(() => store.create(name.trim()));
    };
    modal.querySelector('#btn_rename_collection').onclick = () => perform(() => {
        const name = prompt('Rename collection:', store.read().active);
        if (name && name.trim()) store.rename(name.trim());
    });
    modal.querySelector('#btn_delete_collection').onclick = () => perform(() => {
        if (confirm(`Delete collection "${store.read().active}"?`)) store.delete();
    });
    modal.querySelector('#modal_clear').onclick = () => perform(() => {
        if (confirm(`Clear all chapters in "${store.read().active}"?`)) store.clear();
    });
    modal.querySelector('#modal_close').onclick = close;
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'Tab') {
            const focusable = Array.from(modal.querySelectorAll('button:not(:disabled), select, a[href]'));
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    modal.querySelector('#modal_download').onclick = () => perform(() => {
        const data = store.read(), items = data.collections[data.active];
        if (!items.length) return;
        const url = URL.createObjectURL(new Blob([items.map(item => item.pgn).join('\n\n')], { type: 'application/x-chess-pgn' }));
        const link = element('a', '');
        link.href = url;
        link.download = `${data.active.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pgn`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    window.addEventListener('storage', event => {
        if (event.key === 'listudy_collections') perform(() => {});
    });
    update();
    return { update };
}
