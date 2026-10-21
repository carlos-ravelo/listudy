export function isEditableTarget(target, { includeContentEditableFalse = false } = {}) {
    const editable = includeContentEditableFalse
        ? '[contenteditable]' : '[contenteditable]:not([contenteditable="false"])';
    return Boolean(target?.closest?.(`input, textarea, select, ${editable}`));
}
