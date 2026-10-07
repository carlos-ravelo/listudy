document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-repertoires]');
    if (!root) return;
    const rows = [...root.querySelectorAll('[data-repertoire-row]')];
    if (!rows.length) return;
    const search = root.querySelector('[data-repertoire-search]');
    const deviations = root.querySelector('[data-repertoire-deviations]');
    const previous = root.querySelector('[data-repertoire-previous]');
    const next = root.querySelector('[data-repertoire-next]');
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    const titles = rows.map(row => normalize(row.dataset.title));
    const pageSize = 10;
    let page = 0;
    function render() {
        const query = normalize(search.value.trim());
        const matching = rows.filter((row, index) => titles[index].includes(query) && (!deviations.checked || Number(row.dataset.deviations) > 0));
        page = Math.min(page, Math.max(0, Math.ceil(matching.length / pageSize) - 1));
        rows.forEach(row => { row.hidden = true; });
        matching.slice(page * pageSize, (page + 1) * pageSize).forEach(row => { row.hidden = false; });
        previous.disabled = page === 0;
        next.disabled = (page + 1) * pageSize >= matching.length;
        const first = matching.length ? page * pageSize + 1 : 0;
        root.querySelector('[data-repertoire-count]').textContent = `${first}–${Math.min((page + 1) * pageSize, matching.length)} / ${matching.length}`;
        root.querySelector('[data-repertoire-empty]').hidden = matching.length !== 0;
        previous.parentElement.hidden = matching.length <= pageSize;
    }
    search.addEventListener('input', () => { page = 0; render(); });
    deviations.addEventListener('change', () => { page = 0; render(); });
    previous.addEventListener('click', () => { page--; render(); });
    next.addEventListener('click', () => { page++; render(); });
    root.querySelector('[data-repertoire-tools]').hidden = false;
    root.querySelector('[data-repertoire-pagination]').hidden = false;
    render();
});
