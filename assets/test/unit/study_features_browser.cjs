const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const webpack = require('webpack');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'listudy-collection-ui-'));
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const render = source => source.replace(/<%=\s*dgettext[^%]*%>/g, expression => (expression.match(/"(?:\\.|[^"\\])*"/g)[1]).slice(1, -1)).replace(/<%[\s\S]*?%>/g, '');
const html = `<html><head><link rel="stylesheet" href="/priv/static/css/bootstrap_study.css"></head><body class="bootstrap-ui"><main class="study-workspace">
<h1>Test study</h1>${render(read('lib/listudy_web/templates/study/_study_tools.html.eex'))}${render(read('lib/listudy_web/templates/study/_chapter_controls.html.eex'))}
<button id="puzzle_run"></button>
<div id="collection_modal" class="modal ui-modal collection-modal" tabindex="-1" data-user-id=""><div class="modal-dialog modal-dialog-centered"><div class="modal-content collection-dialog"><div class="modal-header"><div><h2 id="collection_heading">Collections</h2>${read('lib/listudy_web/templates/study/_collection_heading.html.eex')}</div><button id="modal_close" type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close">×</button></div><div class="modal-body">${read('lib/listudy_web/templates/study/_collection_body.html.eex')}</div></div></div></div>
</main><script src="/bootstrap-modals.js"></script>
<script type="module">
import { setupStudyCollections } from '/assets/js/modules/study_collections.js';
import { setupStudyNavigation, setupStudyToolsMenu } from '/assets/js/modules/study_page_controls.js';
const chapters = [{title: 'Alpha', pgn: '1. e4 *'}, {title: '<b>Beta</b>', pgn: '1. d4 *'}];
const select = document.getElementById('chapter_select');
chapters.forEach((chapter, index) => select.add(new Option(chapter.title, index)));
const getCurrentChapter = () => ({...chapters[select.selectedIndex], study: 'Test study', chapterIndex: select.selectedIndex, studyPath: '/en/studies/example'});
window.backCount = 0;
const views = [setupStudyCollections({getCurrentChapter}), setupStudyNavigation({getCurrentChapter, goBack: () => window.backCount++, goForward() {}})];
select.onchange = () => views.forEach(view => view.update());
setupStudyToolsMenu();
window.ready = true;
</script></body></html>`;

(async () => {
    await new Promise((resolve,reject)=>webpack({mode:'development',context:path.join(root,'assets'),
        entry:path.join(root,'assets/js/components/bootstrap_modals.js'),output:{path:temp,filename:'bootstrap-modals.js'}
    },(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString())):resolve()));
    const server = http.createServer((request, response) => {
        if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
        const file = request.url === '/bootstrap-modals.js' ? path.join(temp,'bootstrap-modals.js') : path.resolve(root, '.' + request.url);
        if ((!file.startsWith(root + path.sep) && !file.startsWith(temp + path.sep)) || !fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
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
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('study-progress-updated', { detail: [
            { index: 0, mastered: true, pickerTone: 'in-progress', pickerMetrics: '100% covered · Recall —',
                progressTooltip: 'Continuation coverage: 2/2 (100%)\nRecall: Not enough review data yet',
                dueContinuations: 0, reviewDue: false },
            { index: 1, pickerTone: 'due', pickerMetrics: '50% covered · 2 due',
                progressTooltip: 'Continuation coverage: 1/2 (50%)\nRecall: 50% (2 recent graded reviews)',
                dueContinuations: 2, reviewDue: true }
        ] })));
        assert.strictEqual(await page.locator('.chapter-current-status').textContent(), '100% covered · Recall —');
        assert((await page.locator('.chapter-current-status').getAttribute('title')).includes('Not enough review data yet'));
        assert.strictEqual(await page.locator('.chapter-choice .chapter-choice-status').nth(1).textContent(), '50% covered · 2 due');
        await page.locator('.study-tools-menu summary').click();
        await page.click('#add_to_collection');
        await page.click('#next_chapter_btn');
        await page.locator('.study-tools-menu summary').click();
        await page.click('#add_to_collection');
        await page.locator('.study-tools-menu summary').click();
        await page.click('#manage_collection');
        assert.strictEqual(await page.locator('.collection-row').count(), 2);
        assert.strictEqual(await page.locator('.collection-row b').count(), 0);
        const links = await page.locator('.collection-description a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
        assert(links[1].includes('chapter_index=1'));
        await page.locator('.collection-row').nth(1).locator('button[title="Move up"]').click();
        assert((await page.locator('.collection-row').first().textContent()).includes('<b>Beta</b>'));
        assert.strictEqual(await page.locator('.collection-highlight').count(), 1);
        page.once('dialog', dialog => dialog.accept('Tactics'));
        await page.click('#btn_new_collection');
        await page.locator('.collection-choice').filter({ hasText: 'Default' }).click();
        await page.locator('.collection-row').first().locator('select').selectOption('Tactics');
        assert.strictEqual(await page.locator('.collection-row').count(), 1);
        await page.locator('.collection-choice').filter({ hasText: 'Tactics' }).click();
        assert((await page.locator('.collection-row').textContent()).includes('<b>Beta</b>'));
        await page.click('#modal_close');
        await page.click('#current_chapter_title');
        await page.fill('.chapter-search', 'Alpha');
        await page.keyboard.press('ArrowLeft');
        assert.strictEqual(await page.evaluate(() => window.backCount), 0);
        await page.locator('.chapter-choice', { hasText: 'Alpha' }).click();
        assert.strictEqual(await page.locator('.chapter-current-label').textContent(), '1 / 2 · Alpha');
        await page.keyboard.press('ArrowLeft');
        assert.strictEqual(await page.evaluate(() => window.backCount), 1);
        assert.deepStrictEqual(errors, []);
        console.log('Browser collection and chapter-control smoke checks passed.');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(temp,{recursive:true,force:true});
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
