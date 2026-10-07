document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const toggle = header.querySelector('.site-menu-toggle');
    const menus = [...header.querySelectorAll('.site-menu')];
    const path = window.location.pathname;
    const section = /\/analysis(?:\/|$)/.test(path) ? 'analysis'
        : /\/studies(?:\/|$)/.test(path) ? 'studies'
        : /\/(?:tactics|blind-tactics|pieceless-tactics|endgames)(?:\/|$)/.test(path) ? 'practice' : null;
    header.querySelectorAll('[data-nav-section]').forEach(item => {
        if (item.dataset.navSection !== section) return;
        item.classList.add('is-current');
        if (item.matches('a')) item.setAttribute('aria-current', 'location');
    });
    header.setAttribute('data-navigation-ready', '');
    const close = () => {
        menus.forEach(menu => { menu.open = false; });
        toggle.setAttribute('aria-expanded', 'false');
        header.classList.remove('is-expanded');
    };
    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        if (!expanded) close();
        else {
            toggle.setAttribute('aria-expanded', 'true');
            header.classList.add('is-expanded');
        }
    });
    menus.forEach(menu => menu.addEventListener('toggle', () => {
        if (menu.open) menus.filter(other => other !== menu).forEach(other => { other.open = false; });
    }));
    document.addEventListener('click', event => {
        if (!header.contains(event.target)) close();
    });
    header.addEventListener('click', event => {
        const link = event.target.closest('a');
        if (!link) return;
        if (link.getAttribute('href') === '#') event.preventDefault();
        close();
    });
    header.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const menu = event.target.closest('details[open]');
        if (menu) {
            menu.open = false;
            menu.querySelector('summary').focus();
        } else {
            close();
            toggle.focus();
        }
        event.preventDefault();
    });
});
