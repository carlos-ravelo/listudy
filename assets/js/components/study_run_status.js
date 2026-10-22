export function registerStudyRunStatus(Alpine) {
    Alpine.data('studyRunStatus', kind => ({
        message: '', visible: false,
        update(status) {
            if (status.kind !== kind) return;
            this.message = status.message;
            this.visible = status.visible;
        }
    }));
}

export function publishStudyRunStatus(kind, message = '', visible = Boolean(message)) {
    window.dispatchEvent(new CustomEvent('study-run-status-updated', {
        detail: { kind, message, visible }
    }));
}
