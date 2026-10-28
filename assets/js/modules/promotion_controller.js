import { createPromotionPicker } from './promotion_picker.js';

export function createPromotionController({ element, onOpen, onChoose, onCancel, onPendingChange = () => {} }) {
    let pending = null;
    const picker = createPromotionPicker({ element, onChoose: choose, onCancel: cancel });

    function close() {
        picker.close();
        pending = null;
        onPendingChange(null);
    }

    function choose(role) {
        if (!pending || !['q', 'r', 'b', 'n'].includes(role)) return;
        const move = pending;
        close();
        onChoose(role, move);
    }

    function cancel() {
        if (!pending) return;
        close();
        onCancel();
    }

    return {
        get pending() { return pending; },
        request({ from, to, legal, color, orientation, promotion }) {
            if (pending) return true;
            if (promotion || !element) return false;
            const promotes = legal.some(move => typeof move === 'string'
                ? move.length === 5 && move.startsWith(from + to)
                : move.from === from && move.to === to && move.promotion);
            if (!promotes) return false;
            pending = { from, to };
            onPendingChange(pending);
            onOpen();
            picker.open({ to, color, orientation });
            return true;
        },
        choose,
        cancel,
        close,
        destroy() { close(); picker.destroy(); }
    };
}
