const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const css = fs.readFileSync(path.join(root, 'assets/css/features/study_presentation.css'), 'utf8');
const html = `<style>${css}
.hidden{display:none}body{margin:0}.infoBox{background:#def}#chessground{position:fixed;left:12px;top:50px;width:296px;height:350px}#study_board_actions{position:fixed;top:440px;left:12px;width:296px;height:80px}
</style><div class="study-workspace"><div id="chessground"></div><div id="study_board_actions"></div><div class="study-feedback"><div class="info"><p id="info" class="infoBox hidden"><button class="close_button">×</button><span id="info_text"></span></p></div></div></div>
<script type="module">import {setupStudyFeedback} from '/assets/js/components/study_feedback.js';import {set_text} from '/assets/js/modules/info_boxes.js';setupStudyFeedback();window.showFeedback=text=>set_text('info',text);</script>`;
(async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
        const file = path.join(root, req.url);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
        res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
    try {
        const page = await browser.newPage();
        for (const width of [320, 390]) {
            await page.setViewportSize({width, height: 600});
            await page.goto(`http://127.0.0.1:${server.address().port}`);
            await page.waitForFunction(() => Boolean(window.showFeedback));
            await page.evaluate(() => window.showFeedback('This message must remain fully readable when no gap beside the board is tall enough. '.repeat(4)));
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const bounds = await page.evaluate(() => {
                const region = document.querySelector('.study-feedback'), rect = region.getBoundingClientRect();
                return {top: rect.top, bottom: rect.bottom, right: rect.right, clipped: region.scrollHeight > region.clientHeight + 1};
            });
            assert(bounds.top >= 0 && bounds.bottom <= 600 && bounds.right <= width);
            assert.equal(bounds.clipped, false);
            await page.evaluate(() => { window.showFeedback('Long message. '.repeat(500)); });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await page.evaluate(() => { document.querySelector('.study-feedback').scrollTop = 100; window.showFeedback('Saved.'); });
            assert.equal(await page.locator('.study-feedback').evaluate(el => el.scrollTop), 0);
            await page.locator('.close_button').click();
            assert(await page.locator('#info').isHidden());
        }
        console.log('Feedback stays readable, resets scrolling and dismisses at 320/390px');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
