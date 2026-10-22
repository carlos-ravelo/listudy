import { createPageScope } from './page_scope.js';
import { hasBlockingUi, setupBlockingUi } from './blocking_ui.js';

export function setupStudyFeedback({ durationMs = 4000 } = {}) {
    const scope = createPageScope();
    const region = document.querySelector('.study-feedback');
    if (!region || region.dataset.initialized) return;
    region.dataset.initialized = 'true';
    setupBlockingUi();
    let current, returnFocus, timer, remaining = durationMs, deadline, transient = false, frame;
    function pause() {
        if (timer) { scope.clearTimeout(timer); timer = null; remaining = Math.max(0, deadline - Date.now()); }
    }
    function dismiss() {
        pause();
        const hadFocus = region.contains(document.activeElement);
        current?.classList.add('hidden');
        current = null;
        if (hadFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
    function resume() {
        if (!current || !transient || document.hidden || hasBlockingUi() || region.matches(':hover') || region.contains(document.activeElement)) return;
        pause(); deadline = Date.now() + remaining;
        timer = scope.timeout(dismiss, remaining);
    }
    function position() {
        frame = null;
        if (!current || current.classList.contains('hidden')) return;
        region.style.maxHeight = '';
        const board = document.querySelector('#chessground')?.getBoundingClientRect();
        const width = Math.min(360, innerWidth - 24);
        const beside = board && innerWidth - board.right >= 280;
        region.style.width = `${beside ? Math.min(360, innerWidth - board.right - 24) : Math.min(width, board?.width || width)}px`;
        region.style.insetInlineEnd = 'auto';
        region.style.left = `${beside ? board.right + 12 : Math.max(12, Math.min(board?.left || 12, innerWidth - region.getBoundingClientRect().width - 12))}px`;
        const rect = region.getBoundingClientRect();
        const desiredTop = board ? (beside ? Math.max(12, board.top + 16) : board.bottom + 8) : 12;
        const height = Math.min(region.scrollHeight, innerHeight - 24);
        // Find a viewport gap beside the board and the active game controls.
        const obstacles = [...document.querySelectorAll('#chessground, #study_board_actions, .study-session-controls, .study-chapter-navigation, .sparring-actions, .sparring-navigation, #hints, #reset_line, #study_previous_move, #study_next_move, #open_study_settings, #study_more_actions, .study-tree-move, #endgame_actions, .endgame-feedback-toggle, .endgame-review, .endgame-position-details, .endgame-goal-heading, .endgame-live-assessment, .endgame-live-comment, #endgame_engine_status, .popup')]
            .map(element => element.getBoundingClientRect())
            .filter(item => item.width && item.height && item.right > rect.left && item.left < rect.right)
            .map(item => [Math.max(12, item.top - 8), Math.min(innerHeight - 12, item.bottom + 8)])
            .filter(([top, bottom]) => top < bottom).sort((a, b) => a[0] - b[0]);
        const gaps = []; let top = 12;
        for (const [start, end] of obstacles) {
            if (start > top) gaps.push([top, start]);
            top = Math.max(top, end);
        }
        if (top < innerHeight - 12) gaps.push([top, innerHeight - 12]);
        const candidates = gaps.filter(([start, end]) => end - start >= height)
            .map(([start, end]) => ({ start, end, top: Math.max(start, Math.min(desiredTop, end - height)) }));
        const gap = candidates.sort((a, b) => Math.abs(a.top - desiredTop) - Math.abs(b.top - desiredTop))[0];
        if (gap) {
            region.style.bottom = 'auto';
            region.style.top = `${gap.top}px`;
            region.style.maxHeight = `${gap.end - gap.top}px`;
        } else {
            region.style.top = `${Math.max(12, Math.min(desiredTop, innerHeight - height - 12))}px`;
            region.style.bottom = 'auto';
        }
    }
    function schedulePosition() { if (!frame) frame = scope.frame(position); }
    for (const close of region.querySelectorAll('.close_button')) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'close_button'; button.textContent = '×';
        button.setAttribute('aria-label', region.dataset.dismiss || 'Dismiss notification');
        close.replaceWith(button);
    }
    scope.listen(region, 'study-feedback-change', event => {
        const { id, text, transient: temporary } = event.detail;
        const box = document.getElementById(id);
        if (!box || !region.contains(box)) return;
        if (!text) { if (current === box) dismiss(); return; }
        pause();
        for (const other of region.querySelectorAll('.infoBox')) if (other !== box) other.classList.add('hidden');
        if (!region.contains(document.activeElement)) returnFocus = document.activeElement;
        current = box; transient = temporary; remaining = durationMs;
        region.scrollTop = 0;
        schedulePosition(); resume();
    });
    scope.listen(region, 'click', event => {
        if (!event.target.closest('.close_button')) return;
        event.preventDefault(); event.stopPropagation(); dismiss();
    }, true);
    scope.listen(region, 'pointerenter', pause);
    scope.listen(region, 'pointerleave', resume);
    scope.listen(region, 'focusin', pause);
    scope.listen(region, 'focusout', () => scope.frame(resume));
    scope.listen(document, 'visibilitychange', () => document.hidden ? pause() : resume());
    scope.listen(document, 'ui-blocking-changed', event => {
        if (event.detail.blocked) pause();
        else { schedulePosition(); resume(); }
    });
    scope.listen(window, 'resize', schedulePosition);
    scope.listen(window, 'scroll', schedulePosition, { passive: true });
    scope.listen(window, 'pagehide', dismiss);
    return { destroy() {
        scope.destroy();
        current?.classList.add('hidden');
        current = null;
        region.style.maxHeight = '';
        delete region.dataset.initialized;
    } };
}
