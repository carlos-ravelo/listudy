import { CollectionStore } from './study/collection_store.js';
import { CollectionAccount } from './study/collection_account.js';

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
    const userId = modal.dataset.userId;
    const store = new CollectionStore(localStorage, userId ? `listudy_collections:user:${userId}` : 'listudy_collections');
    const navigation = modal.querySelector('#collection_navigation');
    const status = modal.querySelector('#collection_save_status');
    const create = modal.querySelector('#collection_create_study');
    const studyForm = modal.querySelector('#collection_study_form');
    const addChapter = modal.querySelector('#collection_add_chapter');
    const account = userId ? new CollectionAccount(store, userId, message => showStatus(message)) : null;
    let ready = !account;
    let creating = false;
    let returnFocus;
    const titleInput = modal.querySelector('#collection_active_name');
    function showStatus(message) {
        status.textContent = message;
        const healthy = message === 'Saved to your account' || message === 'Saved on this device · saving to account…';
        modal.querySelector('#collection_sync_recovery').hidden = !userId || healthy;
    }
    titleInput.addEventListener('change', () => {
        const name = titleInput.value.trim();
        if (!name || name === store.read().active) { titleInput.value = store.read().active; return; }
        try { store.rename(name); render(); update(); }
        catch (error) { titleInput.value = store.read().active; alert(error.message); }
    });
    titleInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); titleInput.blur(); }
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation();
            titleInput.value = store.read().active;
            titleInput.blur();
        }
    });

    function update() {
        if (!ready) { add.textContent = 'Loading collections…'; manage.hidden = false; return; }
        try {
            const data = store.read();
            const items = data.collections[data.active];
            const chapter = getCurrentChapter();
            const alreadyAdded = chapter && items.some(item => item.pgn === chapter.pgn);
            const name = data.active.length > 12 ? data.active.slice(0, 12) + '…' : data.active;
            add.textContent = `${alreadyAdded ? 'Added to collection' : 'Add to collection'} · ${name}`;
            add.title = `${alreadyAdded ? 'Chapter already in' : 'Add current chapter to'} ${data.active}`;
            add.classList.toggle('collection-added', Boolean(alreadyAdded));
            add.setAttribute('aria-disabled', String(!chapter || Boolean(alreadyAdded)));
            add.setAttribute('aria-live', 'polite');
            manage.hidden = false;
            manage.textContent = 'Collections';
        } catch (error) {
            console.error(error);
            add.textContent = 'Collections unavailable';
        }
    }

    function button(text, title, action, disabled = false, highlight = -1) {
        const node = element('button', 'collection-action', text);
        node.type = 'button';
        node.title = title;
        node.setAttribute('aria-label', title);
        node.disabled = disabled;
        node.addEventListener('click', () => perform(action, highlight));
        return node;
    }

    function render(highlight = -1) {
        const data = store.read();
        selector.replaceChildren();
        Object.keys(data.collections).forEach(name => selector.add(new Option(name, name, false, name === data.active)));
        navigation.replaceChildren();
        Object.entries(data.collections).forEach(([name, chapters]) => {
            const choice = element('button', 'collection-choice');
            choice.type = 'button';
            choice.setAttribute('aria-pressed', String(name === data.active));
            choice.append(element('span', '', name), element('span', 'collection-count', String(chapters.length)));
            choice.onclick = () => { studyForm.hidden = true; perform(() => store.select(name)); };
            navigation.appendChild(choice);
        });
        list.replaceChildren();
        const items = data.collections[data.active];
        titleInput.value = data.active;
        modal.querySelector('#modal_download').disabled = !items.length;
        modal.querySelector('#collection_chapter_count').textContent = `${items.length} ${items.length === 1 ? 'chapter' : 'chapters'}`;
        create.disabled = !userId || !items.length || creating;
        const chapter = getCurrentChapter();
        addChapter.hidden = !chapter;
        addChapter.disabled = !chapter || items.some(item => item.pgn === chapter.pgn);
        addChapter.textContent = addChapter.disabled ? 'Chapter already added' : 'Add current chapter';
        if (!items.length) list.appendChild(element('li', 'collection-empty', 'No chapters yet. Add the current chapter to start building your study.'));
        let previousStudy;
        items.forEach((item, index) => {
            const study = item.study || 'Unknown Study';
            if (study !== previousStudy) {
                list.appendChild(element('li', 'collection-study', study));
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
                move.add(new Option('Move', ''));
                move.options[0].disabled = true;
                otherNames.forEach(name => move.add(new Option(name, name)));
                move.addEventListener('change', () => perform(() => store.move(index, move.value)));
                actions.appendChild(move);
            }
            actions.appendChild(button('↑', 'Move up', () => store.reorder(index, -1), index === 0, index - 1));
            actions.appendChild(button('↓', 'Move down', () => store.reorder(index, 1), index === items.length - 1, index + 1));
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
                if (!modal.contains(document.activeElement)) focusCollection();
            }
            update();
        }
        catch (error) { alert(error.message || 'The collection could not be saved.'); }
    }
    function close() { modal.hidden = true; if (returnFocus) returnFocus.focus(); }
    function focusCollection() { navigation.querySelector('[aria-pressed="true"]')?.focus(); }
    function open() {
        if (!ready) return;
        perform(() => { render(); returnFocus = document.activeElement; modal.hidden = false; focusCollection(); });
    }
    add.addEventListener('click', event => {
        event.preventDefault();
        if (!ready) return;
        perform(() => {
            const chapter = getCurrentChapter();
            if (chapter) store.add(chapter);
        });
    });
    manage.addEventListener('click', event => {
        event.preventDefault();
        open();
    });
    addChapter.onclick = () => perform(() => { const chapter = getCurrentChapter(); if (chapter) store.add(chapter); });
    modal.querySelector('#collection_retry_save').hidden = !account;
    modal.querySelector('#collection_reload').hidden = !account;
    modal.querySelector('#collection_retry_save').onclick = async () => {
        try { if (!account.ready) await account.initialize(); else await account.flush(); render(); update(); }
        catch (error) { showStatus(error.message); }
    };
    modal.querySelector('#collection_reload').onclick = async () => {
        if (!confirm('Replace this device’s collection draft with the saved account copy? Download your PGN first if you want to keep the draft.')) return;
        try { await account.reload(); render(); update(); }
        catch (error) { showStatus(error.message); }
    };
    create.title = userId ? 'Create a study from this collection' : 'Sign in to create a study';
    create.onclick = () => {
        studyForm.hidden = false;
        modal.querySelector('#collection_study_title').value = store.read().active;
        modal.querySelector('#collection_study_title').focus();
    };
    modal.querySelector('#collection_cancel_study').onclick = () => { studyForm.hidden = true; create.focus(); };
    studyForm.onsubmit = async event => {
        event.preventDefault();
        if (creating || !account) return;
        creating = true;
        const selection = { collection: store.read().active, title: studyForm.elements.title.value, color: studyForm.elements.color.value };
        studyForm.querySelector('button[type="submit"]').disabled = true;
        try {
            await account.flush();
            const response = await fetch('/api/collections/study', {
                method: 'POST', credentials: 'same-origin',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-csrf-token': document.querySelector('meta[name="csrf-token"]')?.content || '' },
                body: JSON.stringify({ revision: account.revision, ...selection })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'The study could not be created.');
            window.location.assign(result.url);
        } catch (error) { showStatus(error.message); }
        finally { creating = false; studyForm.querySelector('button[type="submit"]').disabled = false; }
    };
    selector.addEventListener('change', () => perform(() => store.select(selector.value)));
    modal.querySelector('#btn_new_collection').onclick = () => {
        const name = prompt('Enter a name for the new collection:');
        if (name && name.trim()) perform(() => store.create(name.trim()));
    };
    modal.querySelector('#btn_delete_collection').onclick = () => perform(() => {
        if (confirm(`Delete collection "${store.read().active}"?`)) store.delete();
    });
    modal.querySelector('#modal_clear').onclick = () => perform(() => {
        if (confirm(`Clear all chapters in "${store.read().active}"?`)) store.clear();
    });
    modal.querySelector('#modal_close').onclick = close;
    modal.querySelector('.collection-options-panel').addEventListener('click', event => {
        if (event.target.closest('button')) modal.querySelector('.collection-options').open = false;
    });
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'Tab') {
            const focusable = Array.from(modal.querySelectorAll('button:not(:disabled), select, input, summary, a[href]')).filter(node => node.getClientRects().length);
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
        if (event.key === store.key) {
            if (account) { account.blocked = true; showStatus('Collections changed in another tab. Reload saved collections before continuing.'); }
            perform(() => {});
        }
    });
    if (account) account.initialize().catch(() => {}).finally(() => { ready = true; update(); });
    else status.textContent = 'Saved on this device · sign in to create a study and save collections to your account';
    update();
    return { update };
}
