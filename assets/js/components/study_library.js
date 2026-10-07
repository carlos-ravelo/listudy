document.addEventListener('DOMContentLoaded', () => {
    const library = document.querySelector('[data-study-library]');
    if (!library) return;
    const controls = library.querySelector('[data-library-controls]');
    if (!controls) return;
    const search = library.querySelector('[data-library-search]');
    const buttons = [...library.querySelectorAll('[data-library-color]')];
    const rows = [...library.querySelectorAll('[data-library-row]')];
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    const searchText = rows.map(row => normalize(row.dataset.search));
    let color = 'all';
    const filter = () => {
        const query = normalize(search.value.trim());
        let visible = 0;
        rows.forEach((row, index) => {
            row.hidden = !(searchText[index].includes(query) && (color === 'all' || row.dataset.color === color));
            if (!row.hidden) visible++;
        });
        library.querySelectorAll('[data-library-section]').forEach(section => {
            section.hidden = !section.querySelector('[data-library-row]:not([hidden])');
        });
        buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.libraryColor === color)));
        library.querySelector('[data-library-count]').textContent = `${visible} / ${rows.length}`;
        library.querySelector('[data-library-empty]').hidden = visible !== 0;
    };
    search.addEventListener('input', filter);
    buttons.forEach(button => button.addEventListener('click', () => {
        color = button.dataset.libraryColor;
        filter();
    }));
    controls.hidden = false;
    filter();
});
