export function createStudyRun({ getChapter, replay, pause }) {
    let revision = 0, replaying = false, destroyed = false;
    const run = {
        get revision() { return revision; },
        get replaying() { return replaying; },
        invalidate() { return ++revision; },
        stopReplay() { replaying = false; },
        isCurrent(value) { return !destroyed && value === revision; },
        async replayPosition({ root, fen, path, count, present, advance, finish }) {
            if (destroyed) return false;
            const chapter = getChapter();
            const token = run.invalidate();
            replaying = true;
            const isCurrent = () => run.isCurrent(token) && getChapter() === chapter;
            try {
                return await replay({ root, fen, path, count, present, advance, pause, isCurrent });
            } finally {
                if (isCurrent()) {
                    replaying = false;
                    finish();
                }
            }
        },
        destroy() { destroyed = true; run.invalidate(); replaying = false; }
    };
    return run;
}
