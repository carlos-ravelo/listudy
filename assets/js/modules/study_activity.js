const modes = ['read', 'smart', 'lines', 'sparring'];

export function readStudyActivity(studyId, storage) {
    try {
        const mode = (storage ?? localStorage).getItem(`studyActivity:${studyId}`);
        return modes.includes(mode) ? mode : null;
    } catch (_) { return null; }
}

export function requestedStudyActivity(search) {
    const params = new URLSearchParams(search);
    // Links from game analysis and chapter practice keep their own training context.
    if (params.has('practice') || params.has('practice_fen')) return null;
    const mode = params.get('mode');
    return modes.includes(mode) ? mode : null;
}

export function trackStudyActivity(studyId, storage) {
    const save = mode => {
        if (!modes.includes(mode)) return;
        try { (storage ?? localStorage).setItem(`studyActivity:${studyId}`, mode); } catch (_) {}
    };
    const reading = event => { if (event.detail.reading) save('read'); };
    const sparring = event => { if (event.detail.active) save('sparring'); };
    const changed = () => save(window.studyPuzzleRunMode === 'smart' ? 'smart' : 'lines');
    window.addEventListener('study-reading-updated', reading);
    window.addEventListener('study-sparring-updated', sparring);
    window.addEventListener('study-puzzle-run-changed', changed);
    save.destroy = () => {
        window.removeEventListener('study-reading-updated', reading);
        window.removeEventListener('study-sparring-updated', sparring);
        window.removeEventListener('study-puzzle-run-changed', changed);
    };
    return save;
}
