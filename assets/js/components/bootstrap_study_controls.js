import Tab from 'bootstrap/js/dist/tab';

export function setupBootstrapStudyControls() {
    const workspace = document.querySelector('[data-training-kind]');
    if (!workspace || workspace.dataset.bootstrapControls) return;
    workspace.dataset.bootstrapControls = 'true';
    for (const trigger of workspace.querySelectorAll('[data-study-dialog]')) {
        trigger.setAttribute('data-bs-toggle', 'modal');
        trigger.setAttribute('data-bs-target', `#${trigger.dataset.studyDialog}`);
    }
    for (const dialog of workspace.querySelectorAll('.study-training-modal')) {
        dialog.addEventListener('show.bs.modal', event => {
            if (event.relatedTarget?.dataset.studyComments) {
                const discussion = dialog.querySelector('#study_discussion');
                if (discussion) discussion.open = true;
            }
            if (dialog.id === 'study_settings_dialog') {
                const section = document.getElementById('practice_sparring')?.getAttribute('aria-pressed') === 'true' ? 'sparring'
                    : document.getElementById('study_mode')?.getAttribute('aria-pressed') === 'true' ? 'general' : 'practice';
                dialog.dispatchEvent(new CustomEvent('study-settings-select', { detail: section }));
            }
        });
        dialog.querySelectorAll('input[type="number"], textarea').forEach(node => node.classList.add('form-control'));
        dialog.querySelectorAll('select').forEach(node => node.classList.add('form-select'));
        dialog.querySelectorAll('input[type="checkbox"]').forEach(node => node.classList.add('form-check-input'));
        dialog.querySelectorAll('input[type="range"]').forEach(node => node.classList.add('form-range'));
        dialog.querySelectorAll('button:not([role="tab"]):not(.btn-close):not(.chapter-progress-summary)').forEach(node => node.classList.add('btn', 'btn-outline-secondary'));
    }
    const settings = document.getElementById('study_settings_dialog');
    if (!settings) return;
    const tabs = [...settings.querySelectorAll('[data-settings-tab]')];
    const panels = [...settings.querySelectorAll('[data-settings-panel]')];
    const syncPanels = () => {
        for (const panel of panels) panel.hidden = !panel.classList.contains('active');
    };
    for (const tab of tabs) {
        if (tab.hidden) tab.disabled = true;
        Tab.getOrCreateInstance(tab);
    }
    settings.addEventListener('shown.bs.tab', syncPanels);
    settings.addEventListener('study-settings-select', event => {
        const tab = tabs.find(tab => !tab.hidden && tab.dataset.settingsTab === event.detail);
        if (tab) Tab.getOrCreateInstance(tab).show();
    });
    syncPanels();
}
