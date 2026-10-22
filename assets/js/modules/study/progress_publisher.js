export function createProgressPublisher({ project, publish, afterUpdate = () => {},
    clock = () => new Date(), schedule = setTimeout, cancel = clearTimeout }) {
    let timer, destroyed = false;
    function update() {
        if (destroyed) return;
        const now = clock();
        const summaries = project(now);
        publish(summaries);
        cancel(timer);
        const nextDueAt = summaries
            .filter(summary => summary.reviewDueAt && summary.reviewDueAt > now.getTime())
            .reduce((earliest, summary) => Math.min(earliest, summary.reviewDueAt), Infinity);
        timer = Number.isFinite(nextDueAt)
            ? schedule(update, Math.min(nextDueAt - now.getTime() + 1000, 2147483647))
            : undefined;
        afterUpdate();
    }
    return {
        update,
        destroy() { destroyed = true; cancel(timer); }
    };
}
