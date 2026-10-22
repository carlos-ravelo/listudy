export function openDialog(dialog, trigger) {
    dialog.dispatchEvent(new CustomEvent('ui-modal-open', { bubbles: true, detail: { trigger } }));
}

export function closeDialog(dialog) {
    if (dialog.classList.contains('ui-modal')) {
        dialog.dispatchEvent(new CustomEvent('ui-modal-close', { bubbles: true }));
    } else if (typeof dialog.close === 'function') dialog.close();
    else dialog.style.display = 'none';
}

export function onDialogClosed(dialog, callback) {
    const event = dialog.classList.contains('ui-modal') ? 'hidden.bs.modal' : 'close';
    dialog.addEventListener(event, callback);
    return () => dialog.removeEventListener(event, callback);
}
