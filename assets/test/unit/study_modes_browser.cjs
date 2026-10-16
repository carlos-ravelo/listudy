const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const render = source => source.replace(/<%=\s*dgettext[^%]*%>/g,
    expression => expression.match(/"(?:\\.|[^"\\])*"/g)[1].slice(1, -1));
const source = read('lib/listudy_web/templates/study/show.html.eex');
const controls = render(source.slice(source.indexOf('<div class="study-session-controls">'), source.indexOf('<div class="study-context">')));
const html = `<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/css/features/study_presentation.css">
<link rel="stylesheet" href="/assets/css/features/sparring.css">
<style>:root{--font-color:#222;--bg-color:#fff;--bg-highlight-color:#ddd}body{margin:16px}.study-workspace{--study-divider:#bbb}</style>
</head><body><main class="study-workspace">${controls}</main>
<script type="module">
import { setupPuzzleRun } from '/assets/js/modules/study_page_controls.js';
setupPuzzleRun({}, {initialMode:'off'});
const reading = value => window.dispatchEvent(new CustomEvent('study-reading-updated',{detail:{reading:value}}));
const sparring = value => {
 document.getElementById('practice_sparring').setAttribute('aria-pressed',String(value));
 window.dispatchEvent(new CustomEvent('study-sparring-updated',{detail:{active:value}}));
};
window.addEventListener('study-reading-change',()=>{
 window.dispatchEvent(new Event('study-puzzle-run-off'));sparring(false);reading(true);
});
window.addEventListener('study-puzzle-run-changed',()=>{sparring(false);reading(false)});
document.getElementById('practice_sparring').onclick=()=>{
 window.dispatchEvent(new Event('study-puzzle-run-off'));reading(false);sparring(true);
};
window.ready=true;
</script></body></html>`;
(async () => {
    const server = http.createServer((request, response) => {
        if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
        const file = path.resolve(root, '.' + request.url);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
        response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => window.ready);
        async function selected(id) {
            assert.equal(await page.locator('#study_practice_choices button[aria-pressed="true"]').count(), 1);
            assert.equal(await page.getAttribute('#' + id, 'aria-pressed'), 'true');
        }
        await selected('practice_lines');
        for (const id of ['practice_smart', 'study_mode', 'practice_lines', 'practice_sparring', 'study_mode', 'practice_smart']) {
            await page.click('#' + id); await selected(id);
        }
        await page.click('#study_mode');
        assert.equal(await page.locator('#line_order_control').isHidden(), true);
        assert.equal(await page.locator('#practice_smart').isEnabled(), true);
        assert.equal(await page.locator('#practice_lines').isEnabled(), true);
        await page.locator('#practice_lines').focus();
        await page.keyboard.press('Enter'); await selected('practice_lines');
        await page.locator('#study_mode').focus();
        await page.keyboard.press('Space'); await selected('study_mode');
        await page.click('#study_mode'); await selected('study_mode');
        assert.equal(await page.textContent('#study_mode'), 'Read');
        for (const width of [320, 390, 768, 1280]) {
            await page.setViewportSize({width, height:900});
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            for (const id of ['study_mode', 'practice_smart', 'practice_lines', 'practice_sparring']) {
                const bounds = await page.locator('#' + id).boundingBox();
                assert(bounds.height >= 44 && bounds.width >= 44);
            }
        }
        assert.deepEqual(errors, []);
        console.log('Read, Smart, Full lines and Sparring mode selection, keyboard access and responsive controls passed');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
