export function registerStudyComments(Alpine) {
    Alpine.data('studyComments', () => ({
        rows: [],
        update(rows) { this.rows = rows; }
    }));
}

export function publishStudyComments(rows = []) {
    window.dispatchEvent(new CustomEvent('study-comments-updated', { detail: rows }));
}
