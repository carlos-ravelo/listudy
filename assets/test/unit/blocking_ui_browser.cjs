const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/priv/static/css/bootstrap_ui.css">
<link rel="stylesheet" href="/assets/css/features/study_presentation.css">
<style>.hidden{display:none}.study-feedback{top:20px;left:20px}#collection_modal{position:fixed;inset:0;background:white}</style>
</head><body><main class="study-workspace">
<button id="current_chapter_title"></button><div id="custom_chapter_list" hidden></div>
<select id="chapter_select" hidden><option>Chapter one</option></select>
<button id="btn_random_chapter">Random</button><button id="copy_line_to_clipboard">Copy</button>
<input id="study_session_goal" value="20"><p id="study_session_counter"></p>
<section id="study_session_end" hidden><h2 id="study_session_end_title" tabindex="-1"></h2><p id="study_session_result"></p>
<button id="study_session_continue">Continue</button><button id="study_session_finish">Finish</button></section>
<button id="progress">Progress</button><p id="study_time_today"></p><p id="study_time_total"></p><ol id="study_session_history"></ol>
<div class="study-feedback"><div class="info"><p id="info" class="infoBox hidden"><button class="close_button">×</button><span id="info_text"></span></p></div></div>
<dialog id="native"><button>Close</button></dialog>
<div id="progress_modal" class="modal"><button>Progress content</button></div>
<div id="collection_modal" hidden><div role="dialog" aria-modal="true"><button>Collection content</button></div></div>
<div id="bootstrap" class="modal fade" tabindex="-1" aria-hidden="true"><div class="modal-dialog"><div class="modal-content"><div class="modal-body"><button>Bootstrap content</button></div></div></div></div>
</main><script src="/assets/node_modules/bootstrap/dist/js/bootstrap.bundle.min.js"></script>
<script type="module">
import { hasBlockingUi, setupBlockingUi } from '/assets/js/modules/blocking_ui.js';
import { setupStudyNavigation } from '/assets/js/modules/study_page_controls.js';
import { setupStudySessions } from '/assets/js/modules/study_sessions.js';
import { setupStudyFeedback } from '/assets/js/modules/study_feedback.js';
import { set_text } from '/assets/js/modules/info_boxes.js';
let now = Date.now(), callbacks = [], stats = { version: 1, chapters: {} }, sequence = 0;
Date.now = () => now;
window.setInterval = callback => callbacks.push(callback);
window.backCount = 0;
setupStudyNavigation({getCurrentChapter:()=>({pgn:'1. e4 *'}),goBack:()=>window.backCount++,goForward(){}});
const controller = setupStudySessions({getStats:()=>stats,persist(){},storage:{getItem:()=>20,setItem(){}},
labels:{total:'Total',today:'Today',decisions:'decisions',sessions:'sessions',lines:'Lines'},onContinue(){},onFinish(){}});
setupStudyFeedback({durationMs:250});
// Separate webpack entry points can include separate copies of the module.
(await import('/assets/js/modules/blocking_ui.js?second-copy')).setupBlockingUi();
setupBlockingUi();
window.blockEvents = 0;
document.addEventListener('ui-blocking-changed',()=>window.blockEvents++);
window.blocked = hasBlockingUi;
window.advance = ms => { now += ms; callbacks.forEach(callback=>callback()); };
window.begin = () => { controller.begin('lines');controller.decision('lines',String(++sequence),false,true,false); };
window.finish = () => { controller.end();return Object.values(stats.studySessions).at(-1).activeMs; };
window.showFeedback = () => set_text('info','Keep this message during a dialog');
window.showTransient = () => set_text('info','Temporary message',{transient:true});
window.modal = new bootstrap.Modal(document.getElementById('bootstrap'));
window.ready = true;
</script></body></html>`;
(async () => {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html');res.end(html);return; }
        const file = path.resolve(root, '.' + url.pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404;res.end();return; }
        res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => window.ready);
        const assertState = async expected => {
            await page.waitForFunction(value => document.documentElement.hasAttribute('data-ui-blocked') === value, expected);
            assert.equal(await page.evaluate(() => blocked()), expected);
            assert.equal(await page.locator('.study-feedback').evaluate(node => getComputedStyle(node).visibility), expected ? 'hidden' : 'visible');
            const previous = await page.evaluate(() => backCount);
            await page.evaluate(() => document.querySelector('main').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
            assert.equal(await page.evaluate(() => backCount), previous + (expected ? 0 : 1));
        };
        await assertState(false);
        for (const kind of ['native', 'legacy', 'collection', 'bootstrap']) {
            await page.evaluate(() => { begin();showFeedback();advance(1000); });
            const eventsBefore = await page.evaluate(() => blockEvents);
            await page.evaluate(value => {
                if (value === 'native') document.getElementById('native').showModal();
                if (value === 'legacy') document.getElementById('progress_modal').style.display = 'block';
                if (value === 'collection') document.getElementById('collection_modal').hidden = false;
                if (value === 'bootstrap') modal.show();
            }, kind);
            await assertState(true);
            if (kind === 'bootstrap') await page.waitForFunction(() => document.getElementById('bootstrap').getAttribute('aria-modal') === 'true');
            await page.evaluate(() => advance(5000));
            if (kind === 'bootstrap') {
                await page.waitForTimeout(400);
                await page.evaluate(() => modal.hide());
                assert(await page.evaluate(() => blocked()), 'Closing transition must still block');
            } else await page.evaluate(value => {
                if (value === 'native') document.getElementById('native').close();
                if (value === 'legacy') document.getElementById('progress_modal').style.display = 'none';
                if (value === 'collection') document.getElementById('collection_modal').hidden = true;
            }, kind);
            await assertState(false);
            await page.evaluate(() => advance(1000));
            assert.equal(await page.evaluate(() => finish()), 2000, `${kind}: time spent in modal is excluded`);
            assert.equal(await page.evaluate(() => blockEvents), eventsBefore + 2, 'Initialization must not duplicate state events');
            assert.equal(await page.locator('#info_text').textContent(), 'Keep this message during a dialog');
        }
        // Closing one dialog must not resume training while another remains open.
        await page.evaluate(() => {
            document.getElementById('progress_modal').style.display = 'block';
            document.getElementById('native').showModal();
        });
        await assertState(true);
        await page.evaluate(() => document.getElementById('native').close());
        await assertState(true);
        await page.evaluate(() => document.getElementById('progress_modal').remove());
        await assertState(false);
        // Inserting an already-open dialog is also observed.
        await page.evaluate(() => {
            const dialog = document.createElement('dialog');dialog.id='inserted';dialog.open=true;document.body.append(dialog);
        });
        await assertState(true);
        await page.evaluate(() => document.getElementById('inserted').remove());
        await assertState(false);
        await page.evaluate(() => { showTransient();document.getElementById('native').showModal(); });
        await assertState(true);
        await page.waitForTimeout(400);
        assert.equal(await page.locator('#info').evaluate(node => node.classList.contains('hidden')), false, 'Transient feedback must not expire behind a dialog');
        await page.evaluate(() => document.getElementById('native').close());
        await assertState(false);
        await page.waitForFunction(() => document.getElementById('info').classList.contains('hidden'));
        assert.deepEqual(errors, []);
        console.log('Native, legacy, collection and Bootstrap dialogs pause time, block shortcuts and hide feedback; transitions, overlapping dialogs and initialization passed');
    } finally { await browser.close();await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error);process.exitCode=1; });
