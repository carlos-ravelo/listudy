const observerKey = Symbol.for('listudy.blockingUi');
const containers = 'dialog, .modal, #collection_modal, [role="dialog"]';

export function hasBlockingUi() {
    // Bootstrap holds modal-open throughout both backdrop transitions.
    if (document.body?.classList.contains('modal-open') || document.querySelector('dialog[open]')) return true;
    return [...document.querySelectorAll('.modal, #collection_modal, [role="dialog"][aria-modal="true"]')]
        .some(node => !node.hidden && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
}

export function setupBlockingUi() {
    if (document[observerKey]) return;
    const update = () => {
        const blocked = hasBlockingUi();
        if (document.documentElement.hasAttribute('data-ui-blocked') === blocked) return;
        document.documentElement.toggleAttribute('data-ui-blocked', blocked);
        document.dispatchEvent(new CustomEvent('ui-blocking-changed', { detail: { blocked } }));
    };
    const containsDialog = node => node.nodeType === 1 && (node.matches(containers) || node.querySelector(containers));
    const observer = new MutationObserver(records => {
        if (records.some(record => record.type === 'childList'
            ? [...record.addedNodes, ...record.removedNodes].some(containsDialog)
            : record.target === document.body || containsDialog(record.target))) update();
    });
    observer.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['open', 'hidden', 'style', 'class', 'aria-modal']
    });
    document[observerKey] = observer;
    update();
}
