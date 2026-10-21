import 'phoenix_html';
import './components/bootstrap_modals.js';
import './components/site_navigation.js';
import './components/sound_settings.js';
import './components/chessboard_settings.js';
import { setupSiteTheme } from './modules/site_theme.js';
import { setupStudyLibrary } from './components/study_library.js';
import { createLibraryControls } from './components/bootstrap_library_controls.js';

setupSiteTheme();
document.addEventListener('DOMContentLoaded', () => {
    const library = document.querySelector('[data-library-ui="bootstrap"]');
    if (library) setupStudyLibrary(library, createLibraryControls(library));
});
