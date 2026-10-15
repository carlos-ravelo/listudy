const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('lib/listudy_web/templates/study/show.html.eex');
const render = text => text.replace(/<%=\s*dgettext[^%]*%>/g, expression =>
    expression.match(/"(?:\\.|[^"\\])*"/g)[1].slice(1, -1)).replace(/<%[\s\S]*?%>/g, '');
const settings = render(source.match(/<dialog id="study_settings_dialog"[\s\S]*?<\/dialog>/)[0]);
const feedback = render(source.match(/<!-- Active session feedback -->[\s\S]*?(?=<dialog)/)[0]);
const statsPanel = render(source.match(/<section class="study-time-summary"[\s\S]*?<\/section>/)[0]);
const html = `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/priv/static/css/app.css"><style>${read('assets/css/features/study_presentation.css')}</style></head>
<body><main class="container study-workspace"><button id="open_settings">Settings</button><button id="progress">Progress</button>
${feedback}${settings}<div id="progress_modal">${statsPanel}</div></main>
<script type="module">
import { setupStudySessions } from '/assets/js/modules/study_sessions.js';
let stats = JSON.parse(localStorage.getItem('session-test-stats') || '{"version":1,"chapters":{}}');
if (!localStorage.getItem('smart_session_goal')) localStorage.setItem('smart_session_goal', '5');
const labels = { session:'Session', newMoves:'new', practiced:'practiced', decisions:'decisions', sessions:'sessions',
 total:'Total', today:'Today', lines:'Full lines', positions:'Positions', inProgress:'In progress',
 goalReached:'Goal reached', noWork:'Complete for now', saved:'Saved', finishChain:'Finish the current chain' };
const controller = setupStudySessions({getStats:()=>stats, persist:()=>localStorage.setItem('session-test-stats',JSON.stringify(stats)),
 storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)}, labels,
 onContinue:()=>controller.begin('smart'), onFinish:()=>controller.end()});
window.feed = (key, learning=false) => controller.decision('smart',key,learning,true,false);
window.boundary = () => controller.boundary();
window.getStats = () => stats;
window.controller = controller;
document.getElementById('open_settings').onclick=()=>document.getElementById('study_settings_dialog').showModal();
controller.begin('smart');
window.ready=true;
</script></body></html>`;
(async () => {
    const server = http.createServer((request, response) => {
        if (request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
        const file = path.resolve(root, '.' + request.url);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
        response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => window.ready);
        assert((await page.locator('#study_session_counter').textContent()).includes('0/5'));
        await page.evaluate(() => { feed('a', true); feed('b', true); feed('c'); feed('c'); feed('d'); feed('e'); });
        assert((await page.locator('#study_session_counter').textContent()).includes('5/5'));
        assert.equal(await page.locator('#study_session_end').isVisible(), false);
        await page.evaluate(() => feed('f'));
        assert.equal(await page.evaluate(() => boundary()), true);
        assert((await page.locator('#study_session_result').textContent()).includes('2 new · 4 practiced'));
        assert.equal(await page.locator('#study_session_counter').isVisible(), false);
        assert.equal(await page.locator('#study_session_end').isVisible(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'study_session_end_title');
        await page.click('#open_settings');
        await page.fill('#study_session_goal', '10');
        await page.locator('#study_session_goal').dispatchEvent('change');
        await page.keyboard.press('Escape');
        await page.click('#study_session_continue');
        assert((await page.locator('#study_session_counter').textContent()).includes('0/10'));
        await page.evaluate(() => feed('g'));
        await page.click('#progress');
        assert((await page.locator('#study_time_total').textContent()).includes('7 decisions · 2 sessions'));
        assert.equal(await page.locator('#study_session_history li').count(), 2);
        for (const width of [320, 390, 1024]) {
            await page.setViewportSize({ width, height: 844 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        await page.reload();
        await page.waitForFunction(() => window.ready);
        assert((await page.locator('#study_session_counter').textContent()).includes('0/10'));
        await page.click('#progress');
        assert((await page.locator('#study_time_total').textContent()).includes('7 decisions · 2 sessions'));
        assert.deepEqual(errors, []);
        console.log('Browser session goals, chain-boundary finish, continuation, progress history and reload passed');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
