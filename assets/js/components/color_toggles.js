export function setupColorToggles(container, onChange) {
    const click = event => {
        const button = event.target.closest('[data-library-color]');
        if (!button || !container.contains(button)) return;
        const color = button.getAttribute('aria-pressed') === 'true' ? 'all' : button.dataset.libraryColor;
        container.querySelectorAll('[data-library-color]').forEach(item => {
            item.setAttribute('aria-pressed', String(item.dataset.libraryColor === color));
        });
        onChange(color);
    };
    container.addEventListener('click', click);
    return () => container.removeEventListener('click', click);
}

export const StudySearchColors = {
    mounted() {
        this.removeColorToggles = setupColorToggles(this.el, color => this.pushEvent('set-color', {color}));
    },
    destroyed() { this.removeColorToggles(); }
};
