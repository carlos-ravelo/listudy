import { normalizeSearchText } from '../modules/search_text.js';
import {setupColorToggles} from "./color_toggles.js";

export function setupStudyLibrary(library = document.querySelector('[data-study-library]'), widgets = {}) {
    if (!library || library.dataset.initialized) return;
    let rows = [...library.querySelectorAll('[data-library-row]')];
    if (!rows.length) return;
    library.dataset.initialized = 'true';
    const labels = JSON.parse(library.dataset.libraryLabels);
    const search = library.querySelector('[data-library-search]');
    if (library.hasAttribute('data-library-simple')) {
        const filter = (writeUrl = true) => {
            const query = normalizeSearchText(search.value.trim());
            rows.forEach(row => { row.hidden = !normalizeSearchText(row.dataset.search).includes(query); });
            const visible = rows.filter(row => !row.hidden).length;
            library.querySelector('[data-library-count]').textContent = `${visible} / ${rows.length}`;
            library.querySelectorAll('[data-library-section]').forEach(section => {
                section.hidden = !section.querySelector('[data-library-row]:not([hidden])');
            });
            library.querySelector('[data-library-empty]').hidden = visible !== 0;
            library.querySelector('[data-library-empty-message]').textContent = labels.emptySearch;
            if (writeUrl) {
                const url = new URL(window.location.href);
                if (search.value) url.searchParams.set('q', search.value); else url.searchParams.delete('q');
                for (const key of ['group', 'color', 'library_view']) url.searchParams.delete(key);
                history.replaceState(null, '', url);
            }
        };
        search.value = new URL(window.location.href).searchParams.get('q') || '';
        search.addEventListener('input', () => filter());
        library.querySelector('[data-library-show-all]').onclick = () => { search.value = ''; filter(); search.focus(); };
        library.querySelectorAll('[data-library-controls]').forEach(control => { control.hidden = false; });
        filter(false);
        return;
    }
    let state = JSON.parse(library.dataset.libraryState);
    const color = { value: 'all' };
    const colorButtons = [...library.querySelectorAll('[data-library-color]')];
    const filtersToggle = library.querySelector('[data-library-toggle-filters]');
    const filtersPanel = library.querySelector('[data-library-filter-panel]');
    filtersToggle.onclick = () => {
        filtersPanel.hidden = !filtersPanel.hidden;
        filtersToggle.setAttribute('aria-expanded', String(!filtersPanel.hidden));
    };
    const group = library.querySelector('[data-library-group]');
    const kind = library.querySelector('[data-library-kind]');
    const organize = library.querySelector('[data-library-organize]');
    const bulk = library.querySelector('[data-library-bulk]');
    const selectAll = library.querySelector('[data-library-select-all]');
    const groupsDialog = library.querySelector('[data-library-groups-dialog]');
    const moveDialog = library.querySelector('[data-library-move-dialog]');
    const showDialog = widgets.showDialog || (dialog => dialog.showModal());
    const hideDialog = widgets.hideDialog || (dialog => dialog.close());
    const onDialogClosed = widgets.onDialogClosed || ((dialog, callback) => dialog.addEventListener('close', callback));
    const moveGroup = library.querySelector('[data-library-move-group]');
    const groupList = library.querySelector('[data-library-group-list]');
    const status = library.querySelector('[data-library-save-status]');
    const selected = new Set();
    const setting = row => state.studies[row.dataset.studyId] || { group: null };
    const hasViews = Boolean(library.querySelector('[data-library-view]'));
    let view = 'all';
    let organizing = false;
    let busy = false;
    let moveIds = [];
    let returnToMove = false;
    let dialogReturn = null;
    const captureFocus = () => document.activeElement.closest('.study-library-menu')?.querySelector('summary') || document.activeElement;
    const restoreFocus = () => {
        const row = dialogReturn?.closest('[data-library-row]');
        (dialogReturn?.isConnected && !row?.hidden ? dialogReturn : search).focus();
    };

    function message(text, failed = false) {
        status.textContent = text;
        status.classList.toggle('is-error', failed);
        library.querySelectorAll('[data-library-dialog-status]').forEach(node => { node.textContent = failed ? text : ''; });
    }
    function selection() {
        const visible = rows.filter(row => !row.hidden);
        selectAll.checked = visible.length > 0 && visible.every(row => selected.has(row.dataset.studyId));
        selectAll.indeterminate = !selectAll.checked && visible.some(row => selected.has(row.dataset.studyId));
        library.querySelector('[data-library-selected]').textContent = `${selected.size} ${labels.selected}`;
        library.querySelectorAll('[data-library-bulk-group]').forEach(button => {
            button.disabled = busy || selected.size === 0;
        });
        const ownsSelection = rows.filter(row => selected.has(row.dataset.studyId)).every(row => row.dataset.editable === 'true');
        library.querySelectorAll('[data-library-bulk-privacy]').forEach(button => {
            button.disabled = busy || selected.size === 0 || !ownsSelection;
        });
        library.querySelector('[data-library-bulk-edit-help]').hidden = ownsSelection;
        rows.forEach(row => { row.querySelector('[data-library-check]').checked = selected.has(row.dataset.studyId); });
    }
    function filter(writeUrl = true) {
        const query = normalizeSearchText(search.value.trim());
        let visible = 0;
        const counts = { favorites: 0, all: rows.length };
        rows.forEach(row => {
            const entry = setting(row);
            if (row.dataset.favorite === 'true') counts.favorites++;
            const groupName = state.groups[entry.group] || '';
            const searchable = normalizeSearchText(row.dataset.search + ' ' + groupName);
            row.hidden = !((view === 'all' || row.dataset.favorite === 'true') && searchable.includes(query) &&
                (!kind || kind.value === 'all' || row.dataset.kind === kind.value) &&
                (color.value === 'all' || row.dataset.color === color.value) &&
                (group.value === 'all' || (group.value === 'none' ? !entry.group : entry.group === group.value)));
            if (!row.hidden) visible++;
            const label = row.querySelector('[data-library-row-group]');
            label.textContent = groupName;
            label.hidden = !groupName;
            row.querySelector('[data-library-select]').hidden = !organizing;
            row.querySelector('[data-library-move-to-group]').hidden = false;
        });
        library.querySelectorAll('[data-library-section]').forEach(section => {
            section.hidden = !section.querySelector('[data-library-row]:not([hidden])');
        });
        library.querySelectorAll('[data-library-view]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.libraryView === view));
            button.querySelector('[data-library-view-count]').textContent = counts[button.dataset.libraryView];
        });
        library.querySelector('[data-library-count]').textContent = `${visible} / ${counts[view]}`;
        const help = library.querySelector('[data-library-help]');
        if (help) {
            help.textContent = labels[view + 'Help'];
            help.hidden = false;
        }
        library.querySelector('[data-library-empty]').hidden = visible !== 0;
        library.querySelector('[data-library-empty-message]').textContent = query || color.value !== 'all' || group.value !== 'all' || (kind && kind.value !== 'all')
            ? labels.emptySearch : view === 'favorites' ? labels.emptyFavorites : labels.emptyLibrary;
        bulk.hidden = !organizing;
        organize.setAttribute('aria-pressed', String(organizing));
        organize.textContent = organizing ? labels.done : labels.organize;
        colorButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.libraryColor === color.value)));
        const activeFilters = Number(color.value !== 'all') + Number(group.value !== 'all') + Number(Boolean(kind && kind.value !== 'all'));
        const filterCount = library.querySelector('[data-library-filter-count]');
        filterCount.hidden = activeFilters === 0;
        filterCount.textContent = String(activeFilters);
        selection();
        if (writeUrl) {
            const url = new URL(window.location.href);
            for (const [key, value] of Object.entries({ library_view: hasViews && view === 'all' ? 'all' : '',
                q: search.value, kind: kind && kind.value !== 'all' ? kind.value : '',
                color: color.value === 'all' ? '' : color.value, group: group.value === 'all' ? '' : group.value })) {
                if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
            }
            history.replaceState(null, '', url);
        }
    }
    function groupOptions() {
        const previous = group.value;
        const moving = moveGroup.value;
        group.replaceChildren(new Option(labels.allGroups, 'all'), new Option(labels.noGroup, 'none'));
        moveGroup.replaceChildren(new Option(labels.noGroup, ''));
        Object.entries(state.groups).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
            group.add(new Option(name, id));
            moveGroup.add(new Option(name, id));
        });
        group.value = [...group.options].some(option => option.value === previous) ? previous : 'all';
        moveGroup.value = [...moveGroup.options].some(option => option.value === moving) ? moving : '';
    }
    function disable(value) {
        busy = value;
        library.querySelectorAll('button, input, select').forEach(control => { control.disabled = value; });
        if (!value) selection();
        widgets.focusDialog?.();
    }
    async function mutate(operation) {
        if (busy) return false;
        disable(true);
        message(labels.saving);
        try {
            const response = await fetch(library.dataset.libraryEndpoint, {
                method: 'PATCH', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '' },
                body: JSON.stringify(operation)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.data) throw new Error(result.error || labels.failed);
            state = result.data;
            library.dataset.libraryState = JSON.stringify(state);
            if (operation.action === 'set_privacy') {
                rows.filter(row => operation.study_ids.includes(row.dataset.studyId)).forEach(row => {
                    row.dataset.private = String(operation.private);
                    row.querySelector('[data-library-visibility]').textContent = operation.private ? labels.private : labels.public;
                });
            }
            if (operation.action === 'set_favorite') {
                const row = rows.find(row => row.dataset.studyId === operation.study_id);
                row.dataset.favorite = String(operation.favorite);
                row.querySelector('[data-library-favorite]').setAttribute('aria-pressed', String(operation.favorite));
                if (!operation.favorite && row.dataset.editable !== 'true') {
                    row.remove();
                    rows = rows.filter(item => item !== row);
                }
            }
            selected.clear();
            groupOptions();
            renderGroups();
            filter();
            message(operation.action === 'set_privacy' ? labels.updated : labels.saved);
            return true;
        } catch (error) {
            message(error instanceof TypeError ? labels.failed : error.message || labels.failed, true);
            return false;
        } finally {
            disable(false);
        }
    }
    function renderGroups() {
        groupList.replaceChildren();
        Object.entries(state.groups).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
            const row = document.createElement('div');
            row.className = 'study-library-group-row';
            row.dataset.groupId = id;
            const title = document.createElement('span');
            title.textContent = name;
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn btn-outline-secondary';
            edit.textContent = labels.edit;
            edit.setAttribute('aria-label', `${labels.edit}: ${name}`);
            edit.onclick = () => {
                const existing = groupList.querySelector('.study-library-group-editor');
                if (existing) { existing.querySelector('input').focus(); return; }
                const form = document.createElement('form');
                form.className = 'study-library-group-editor';
                const input = document.createElement('input');
                input.className = 'form-control';
                input.value = name;
                input.required = true;
                input.maxLength = 60;
                input.setAttribute('aria-label', `${labels.rename}: ${name}`);
                const save = document.createElement('button');
                save.type = 'submit';
                save.className = 'btn btn-primary';
                save.textContent = labels.save;
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'btn btn-outline-secondary';
                cancel.textContent = labels.cancel;
                cancel.onclick = () => { row.replaceChildren(title, edit, remove); edit.focus(); };
                form.append(input, save, cancel);
                form.onsubmit = async event => {
                    event.preventDefault();
                    if (await mutate({ action: 'rename_group', group: id, name: input.value.trim() })) {
                        [...groupList.children].find(row => row.dataset.groupId === id)?.querySelector('button')?.focus();
                    }
                };
                row.replaceChildren(form);
                input.focus();
                input.select();
            };
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-outline-secondary';
            remove.textContent = labels.remove;
            remove.setAttribute('aria-label', `${labels.remove}: ${name}`);
            remove.onclick = async () => {
                if (window.confirm(labels.removeGroup + '\n' + name) && await mutate({ action: 'delete_group', group: id })) {
                    library.querySelector('#library_group_name').focus();
                }
            };
            row.append(title, edit, remove);
            groupList.appendChild(row);
        });
    }
    function closeMenus(except) {
        if (widgets.closeMenus) { widgets.closeMenus(except); return; }
        library.querySelectorAll('.study-library-menu[open]').forEach(menu => { if (menu !== except) menu.open = false; });
    }
    function showGroups() {
        if (!returnToMove) dialogReturn = captureFocus();
        closeMenus();
        message('');
        showDialog(groupsDialog);
    }
    function showMove(ids) {
        dialogReturn = captureFocus();
        closeMenus();
        moveIds = [...ids];
        const groups = [...new Set(rows.filter(row => moveIds.includes(row.dataset.studyId)).map(row => setting(row).group || ''))];
        moveGroup.value = groups.length === 1 ? groups[0] : '';
        message('');
        if (Object.keys(state.groups).length === 0) {
            returnToMove = true;
            showGroups();
        } else showDialog(moveDialog);
    }
    rows.forEach(row => {
        const id = row.dataset.studyId;
        row.querySelector('[data-library-check]').onchange = event => {
            if (event.target.checked) selected.add(id); else selected.delete(id);
            selection();
        };
        row.querySelector('[data-library-favorite]').onclick = async () => {
            const favorite = row.dataset.favorite !== 'true';
            if (await mutate({ action: 'set_favorite', study_id: id, favorite })) {
                if (row.hidden || !row.isConnected) search.focus();
            }
        };
        row.querySelector('[data-library-move-to-group]').onclick = () => showMove([id]);
        row.querySelector('summary').onclick = () => closeMenus(row.querySelector('details'));
        row.querySelectorAll('.study-library-menu-content a').forEach(link => link.addEventListener('click', () => closeMenus()));
    });
    library.querySelectorAll('[data-library-view]').forEach(button => button.onclick = () => {
        selected.clear(); view = button.dataset.libraryView; closeMenus(); filter();
    });
    search.oninput = () => { selected.clear(); filter(); };
    group.onchange = () => { selected.clear(); filter(); };
    setupColorToggles(library, value => {
        color.value = value;
        selected.clear();
        filter();
    });
    if (kind) kind.onchange = () => { selected.clear(); filter(); };
    organize.onclick = () => { organizing = !organizing; selected.clear(); closeMenus(); filter(); search.focus(); };
    selectAll.onchange = () => {
        rows.filter(row => !row.hidden).forEach(row => {
            if (selectAll.checked) selected.add(row.dataset.studyId); else selected.delete(row.dataset.studyId);
        });
        selection();
    };
    library.querySelector('[data-library-bulk-group]').onclick = () => showMove(selected);
    const bulkEdit = library.querySelector('.study-library-bulk-edit');
    if (!widgets.closeMenus) bulkEdit.querySelector('summary').onclick = () => closeMenus(bulkEdit);
    library.querySelectorAll('[data-library-bulk-privacy]').forEach(button => button.onclick = async () => {
        if (await mutate({ action: 'set_privacy', study_ids: [...selected], private: button.dataset.libraryBulkPrivacy === 'true' })) {
            closeMenus();
            bulkEdit.querySelector('summary').focus();
        }
    });
    library.querySelector('[data-library-manage-groups]').onclick = showGroups;
    library.querySelector('[data-library-create-group]').onsubmit = async event => {
        event.preventDefault();
        const input = event.target.elements.name;
        const name = input.value.trim();
        if (await mutate({ action: 'create_group', name })) {
            input.value = '';
            if (returnToMove) {
                moveGroup.value = Object.keys(state.groups).find(id => state.groups[id] === name) || '';
                hideDialog(groupsDialog);
            }
        }
    };
    onDialogClosed(groupsDialog, () => {
        if (returnToMove && Object.keys(state.groups).length) { returnToMove = false; showDialog(moveDialog); }
        else { returnToMove = false; restoreFocus(); }
    });
    onDialogClosed(moveDialog, restoreFocus);
    library.querySelector('[data-library-move-form]').onsubmit = async event => {
        event.preventDefault();
        if (await mutate({ action: 'move', study_ids: moveIds, group: moveGroup.value || null })) hideDialog(moveDialog);
    };
    library.querySelector('[data-library-show-all]').onclick = () => {
        view = 'all'; search.value = ''; color.value = 'all'; group.value = 'all'; if (kind) kind.value = 'all'; selected.clear(); filter(); search.focus();
    };
    if (!widgets.closeMenus) document.addEventListener('click', event => { if (!event.target.closest('.study-library-menu')) closeMenus(); });
    if (!widgets.closeMenus) document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            const menu = library.querySelector('.study-library-menu[open]');
            if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
        }
    });
    if (!widgets.closeMenus) library.querySelector('.study-library-manage > summary').onclick = () => closeMenus(library.querySelector('.study-library-manage'));
    groupOptions();
    const url = new URL(window.location.href);
    view = hasViews && url.searchParams.get('library_view') !== 'all' ? 'favorites' : 'all';
    search.value = url.searchParams.get('q') || '';
    if (kind) kind.value = ['repertoire', 'tactics'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'all';
    color.value = ['white', 'black'].includes(url.searchParams.get('color')) ? url.searchParams.get('color') : 'all';
    if ([...group.options].some(option => option.value === url.searchParams.get('group'))) group.value = url.searchParams.get('group');
    renderGroups();
    library.querySelectorAll('[data-library-controls]').forEach(control => { control.hidden = false; });
    filter(false);
}

document.addEventListener('DOMContentLoaded', () => {
    const library = document.querySelector('[data-study-library]');
    if (library?.dataset.libraryUi !== 'bootstrap') setupStudyLibrary(library);
});
