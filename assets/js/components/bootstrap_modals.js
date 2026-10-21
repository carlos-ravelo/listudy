import Modal from 'bootstrap/js/dist/modal';

// Bootstrap's data API owns opening, dismissal and focus restoration.
const menuTriggers = new WeakMap();
document.addEventListener('ui-modal-close', event => {
    if (event.target.classList.contains('ui-modal')) Modal.getOrCreateInstance(event.target).hide();
});
document.addEventListener('show.bs.modal', event => {
    // Navigation links disappear when their enclosing preferences menu closes.
    const summary = event.relatedTarget?.closest('details')?.querySelector('summary');
    if (summary) menuTriggers.set(event.target, summary);
});
document.addEventListener('shown.bs.modal', event => {
    event.target.querySelector('[data-modal-autofocus]')?.focus();
});
document.addEventListener('hidden.bs.modal', event => {
    menuTriggers.get(event.target)?.focus();
    menuTriggers.delete(event.target);
});

export { Modal };
