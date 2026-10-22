import { createPageScope } from '../page_scope.js';

const mountedPages = new WeakMap();

export function mountStudyPage(root, initialize, { events = window,
    onError = error => console.error('Study initialization failed:', error) } = {}) {
    if (mountedPages.has(root)) return mountedPages.get(root);
    const scope = createPageScope();
    const controller = {
        scope,
        destroy() {
            scope.destroy();
            if (mountedPages.get(root) === controller) {
                mountedPages.delete(root);
                root.dataset.studyPageState = 'disposed';
            }
        }
    };
    mountedPages.set(root, controller);
    root.dataset.studyPageState = 'loading';
    scope.listen(root, 'study-page-dispose', controller.destroy);
    scope.listen(events, 'pagehide', event => { if (!event.persisted) controller.destroy(); });
    controller.ready = Promise.resolve().then(async () => {
        if (!scope.active) return false;
        await initialize(scope);
        if (!scope.active) return false;
        root.dataset.studyPageState = 'ready';
        return true;
    }).catch(error => { controller.destroy(); onError(error); return false; });
    return controller;
}
