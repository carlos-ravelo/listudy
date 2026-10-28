import { createPageScope } from './page_scope.js';

export function createTrainingLifecycle({ restore, events = window, timers = globalThis } = {}) {
    const page = createPageScope({ timers });
    let run = createPageScope({ timers });
    page.use(() => run.destroy());
    page.listen(events, 'pagehide', event => {
        run.destroy();
        if (!event.persisted) page.destroy();
    });
    page.listen(events, 'pageshow', event => {
        if (event.persisted) restore?.();
    });
    return {
        page,
        get run() { return run; },
        reset() {
            if (!page.active) return run;
            run.destroy();
            run = createPageScope({ timers });
            return run;
        },
        destroy() { page.destroy(); }
    };
}
