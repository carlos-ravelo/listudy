const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = `<html><head><link rel="stylesheet" href="/assets/css/features/study_extensions.css"></head><body>
<h1>Test study</h1>${read('lib/listudy_web/templates/study/_chapter_controls.html.eex')}
<a id="copy_line_to_clipboard">Copy PGN</a><button id="puzzle_run"></button>
${read('lib/listudy_web/templates/study/_collection_modal.html.eex')}
<script type="module">
import { setupStudyCollections } from '/assets/js/modules/study_collections.js';
import { setupStudyNavigation } from '/assets/js/modules/study_page_controls.js';
const chapters = [{title: 'Alpha', pgn: '1. e4 *'}, {title: '<b>Beta</b>', pgn: '1. d4 *'}];
const select = document.getElementById('chapter_select');
chapters.forEach((chapter, index) => select.add(new Option(chapter.title, index)));
const getCurrentChapter = () => ({...chapters[select.selectedIndex], study: 'Test study', chapterIndex: select.selectedIndex, studyPath: '/en/studies/example'});
window.backCount = 0;
const views = [setupStudyCollections({getCurrentChapter}), setupStudyNavigation({getCurrentChapter, goBack: () => window.backCount++, goForward() {}})];
select.onchange = () => views.forEach(view => view.update());
window.ready = true;
</script></body></html>`;

(async () => {
    const server = http.createServer((request, response) => {
        if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
        const file = path.resolve(root, '.' + request.url);
        if (!file.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
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
        await page.click('#add_to_collection');
        await page.click('#next_chapter_btn');
        await page.click('#add_to_collection');
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
        await page.selectOption('#collection_selector', 'Default');
        await page.locator('.collection-row').first().locator('select').selectOption('Tactics');
        assert.strictEqual(await page.locator('.collection-row').count(), 1);
        await page.selectOption('#collection_selector', 'Tactics');
        assert((await page.locator('.collection-row').textContent()).includes('<b>Beta</b>'));
        await page.click('#modal_close');
        await page.click('#current_chapter_title');
        await page.fill('.chapter-search', 'Alpha');
        await page.keyboard.press('ArrowLeft');
        assert.strictEqual(await page.evaluate(() => window.backCount), 0);
        await page.locator('.chapter-choice', { hasText: 'Alpha' }).click();
        assert.strictEqual(await page.locator('#current_chapter_title').textContent(), '1 / 2 · Alpha');
        await page.keyboard.press('ArrowLeft');
        assert.strictEqual(await page.evaluate(() => window.backCount), 1);
        assert.deepStrictEqual(errors, []);
        console.log('Browser collection and chapter-control smoke checks passed.');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
