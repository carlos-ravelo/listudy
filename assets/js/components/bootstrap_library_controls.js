import Dropdown from 'bootstrap/js/dist/dropdown';
import { Modal } from './bootstrap_modals.js';

export function createLibraryControls(library) {
    const menus = [...library.querySelectorAll('.study-library-menu')];
    for (const menu of menus) {
        const trigger = menu.querySelector('summary');
        menu.querySelectorAll('.study-library-menu-content > :is(a, button)').forEach(item => item.classList.add('dropdown-item'));
        Dropdown.getOrCreateInstance(trigger, { display: 'static', autoClose: 'outside' });
        trigger.addEventListener('show.bs.dropdown', () => { menu.open = true; });
        trigger.addEventListener('hidden.bs.dropdown', () => { menu.open = false; });
    }
    return {
        showDialog: dialog => Modal.getOrCreateInstance(dialog).show(),
        hideDialog: dialog => Modal.getOrCreateInstance(dialog).hide(),
        onDialogClosed: (dialog, callback) => dialog.addEventListener('hidden.bs.modal', callback),
        focusDialog() {
            const dialog = library.querySelector('.modal[aria-modal="true"]');
            if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
        },
        closeMenus(except) {
            for (const menu of menus) {
                if (menu !== except) Dropdown.getInstance(menu.querySelector('summary')).hide();
            }
        }
    };
}
