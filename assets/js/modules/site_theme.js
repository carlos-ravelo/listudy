export function applySiteTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
}

export function setupSiteTheme() {
    applySiteTheme(document.documentElement.getAttribute('data-theme') || 'light');
    const toggle = document.getElementById('toggle_dark_mode');
    if (!toggle) return;
    toggle.addEventListener('click', event => {
        event.preventDefault();
        const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        localStorage.setItem('data-theme', theme);
        applySiteTheme(theme);
    });
}
