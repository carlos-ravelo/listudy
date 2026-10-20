// Shared by the study editor and playable study modes.
export function createPromotionPicker({ element, onChoose, onCancel }) {
    if (!element) return { open() {}, close() {}, destroy() {} };
    const choices = element.querySelector('.chapter-editor-promotion-choices');
    const click = event => {
        const button = event.target.closest('[data-promotion]');
        if (button) { close(); onChoose(button.dataset.promotion); }
        else if (event.target === element || event.target.closest('[data-promotion-cancel]')) { close(); onCancel(); }
    };
    const keydown = event => {
        if (event.key === 'Escape' && !element.hidden) {
            event.preventDefault(); event.stopPropagation(); close(); onCancel();
        }
    };
    function close() { element.hidden = true; }
    element.addEventListener('click', click);
    element.addEventListener('keydown', keydown);
    return {
        open({ to, color, orientation }) {
            const flipped = orientation === 'black';
            const bottom = (to[1] === '1') !== flipped;
            choices.style.left = `min(calc(100% - 44px), ${(flipped ? 7 - (to.charCodeAt(0) - 97) : to.charCodeAt(0) - 97) * 12.5}%)`;
            choices.style.top = bottom ? 'auto' : '0';
            choices.style.bottom = bottom ? '0' : 'auto';
            choices.classList.toggle('from-bottom', bottom);
            for (const piece of choices.querySelectorAll('piece')) {
                piece.classList.remove('white', 'black'); piece.classList.add(color);
            }
            element.hidden = false;
            choices.querySelector('button').focus({ preventScroll: true });
        },
        close,
        destroy() { close(); element.removeEventListener('click', click); element.removeEventListener('keydown', keydown); }
    };
}
