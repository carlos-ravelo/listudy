export function setupStudyFeedback({ durationMs = 4000 } = {}) {
    const region = document.querySelector('.study-feedback');
    if (!region || region.dataset.initialized) return;
    region.dataset.initialized = 'true';
    let current, returnFocus, timer, remaining = durationMs, deadline, transient = false, frame;
    function pause() {
        if (timer) { clearTimeout(timer); timer = null; remaining = Math.max(0, deadline - Date.now()); }
    }
    function dismiss() {
        pause();
        const hadFocus = region.contains(document.activeElement);
        current?.classList.add('hidden');
        current = null;
        if (hadFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
    function resume() {
        if (!current || !transient || document.hidden || region.matches(':hover') || region.contains(document.activeElement)) return;
        pause(); deadline = Date.now() + remaining;
        timer = setTimeout(dismiss, remaining);
    }
    function position() {
        frame = null;
        if (!current || current.classList.contains('hidden')) return;
        region.style.maxHeight = '';
        const rect = region.getBoundingClientRect();
        const height = Math.min(region.scrollHeight, 160, innerHeight / 4);
        // Find a viewport gap beside the board and the active game controls.
        const obstacles = [...document.querySelectorAll('#chessground, #study_board_actions, .study-session-controls, .study-chapter-navigation, .sparring-actions, .sparring-navigation, #hints, #reset_line, #study_previous_move, #study_next_move, #open_study_settings, #study_more_actions, .study-tree-move')]
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
        const gap = gaps.reverse().find(([start, end]) => end - start >= Math.min(height, 64));
        if (gap) {
            region.style.bottom = `${innerHeight - gap[1]}px`;
            region.style.maxHeight = `${Math.min(160, gap[1] - gap[0])}px`;
        } else region.style.bottom = 'max(12px, env(safe-area-inset-bottom))';
    }
    function schedulePosition() { if (!frame) frame = requestAnimationFrame(position); }
    for (const close of region.querySelectorAll('.close_button')) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'close_button'; button.textContent = '×';
        button.setAttribute('aria-label', region.dataset.dismiss || 'Dismiss notification');
        close.replaceWith(button);
    }
    region.addEventListener('study-feedback-change', event => {
        const { id, text, transient: temporary } = event.detail;
        const box = document.getElementById(id);
        if (!box || !region.contains(box)) return;
        if (!text) { if (current === box) dismiss(); return; }
        pause();
        for (const other of region.querySelectorAll('.infoBox')) if (other !== box) other.classList.add('hidden');
        if (!region.contains(document.activeElement)) returnFocus = document.activeElement;
        current = box; transient = temporary; remaining = durationMs;
        schedulePosition(); resume();
    });
    region.addEventListener('click', event => {
        if (!event.target.closest('.close_button')) return;
        event.preventDefault(); event.stopPropagation(); dismiss();
    }, true);
    region.addEventListener('pointerenter', pause);
    region.addEventListener('pointerleave', resume);
    region.addEventListener('focusin', pause);
    region.addEventListener('focusout', () => requestAnimationFrame(resume));
    document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, { passive: true });
    window.addEventListener('pagehide', dismiss);
}
