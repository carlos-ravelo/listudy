const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const staticRoot = path.resolve(__dirname, '../../../priv/static');
const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const data = { chapters: [
    { title: 'First', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', comment: '', root: [
        { move: 'e4', comment: 'Original', children: [{ move: 'e5', comment: '', children: [] }] }
    ] },
    { title: 'Second', fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', comment: '', root: [] }
] };
const promotionPicker = fs.readFileSync(path.join(__dirname, '../../../lib/listudy_web/templates/component/promotion_picker.html.eex'), 'utf8')
    .replace(/<%=\s*dgettext[^%]*%>/g, expression => expression.match(/"(?:\\.|[^"\\])*"/g)[1].slice(1, -1));
const editorTemplate = fs.readFileSync(path.join(__dirname, '../../../lib/listudy_web/templates/study/editor.html.eex'), 'utf8');
const translate = source => source.replace(/<%=\s*dgettext[^%]*%>/g, expression => expression.match(/"(?:\\.|[^"\\])*"/g)[1].slice(1, -1));
const editorControls = ['editor_delete_move', 'editor_undo', 'editor_redo', 'editor_promote'].map(id =>
    translate(editorTemplate.match(new RegExp('<button[^>]+id="' + id + '"[\\s\\S]*?</button>'))[0])).join('');
const chapterPicker = translate(editorTemplate.match(/<div class="study-chapter-navigation chapter-editor-picker">[\s\S]*?<\/div>\s*<\/div>/)[0]);
const annotationControl = translate(editorTemplate.match(/<select id="editor_annotation"[\s\S]*?<\/select>/)[0]);
const analysisControl = translate(editorTemplate.match(/<a id="editor_analysis"[\s\S]*?<\/a>/)[0]);
const html = `<!doctype html><html class="blue cburnett"><head><meta charset="utf-8">
<meta name="csrf-token" content="test"><link rel="stylesheet" href="/css/bootstrap_editor.css">
<link rel="stylesheet" href="/css/chessground.css"></head><body class="bootstrap-ui"><main class="container">
<section id="chapter_editor" class="chapter-editor" x-data="chapterEditor" @beforeunload.window="beforeLeave($event)" @keydown.window="navigateKey($event)" data-editor="${escape(JSON.stringify({chapters: data.chapters.map(({title}) => ({title})), chapter_index: 0, chapter: data.chapters[0]}))}"
data-revision="original" data-save-url="/save" data-load-url="/chapter" data-loading="Loading" data-load-error="Load failed" data-color="white" data-start="Start"
data-variation="Variation" data-promote="Promote to main line" data-discard-prompt="Discard?" data-saving="Saving"
data-saved="Saved" data-save-error="Save failed" data-unsaved="Unsaved" data-invalid-move="Illegal">
${chapterPicker}
<button id="editor_save" :disabled="saving || !dirty" @click="save()">Save</button>
<button id="editor_discard" :disabled="saving || !dirty" @click="discard()">Discard</button>
<div class="chapter-editor-layout"><div><div class="chapter-editor-board"><div id="editor_board" class="cg-wrap" x-ref="board"></div>${promotionPicker}</div>
<button id="editor_previous" :disabled="saving || !hasPrevious" @click="previous()">Previous</button><button id="editor_next" :disabled="saving || !hasNext" @click="next()">Next</button>
${editorControls}${annotationControl}${analysisControl}
</div>
<div><div id="editor_moves" x-ref="moves"></div><textarea id="editor_comment" x-model="comment" :disabled="saving" @input="updateComment($event.target.value)"></textarea></div></div>
<p id="editor_status" role="status" x-text="status"></p></section></main><script src="/js/study_editor.js"></script></body></html>`;

(async () => {
    let conflict = true;
    let saved;
    const server = http.createServer((request, response) => {
        if (request.url === '/') {
            response.setHeader('Content-Type', 'text/html');
            return response.end(html);
        }
        if (request.url === '/saved') return response.end('Saved');
        if (request.url.startsWith('/chapter?')) {
            const query = new URL(request.url, 'http://localhost').searchParams;
            const index = Number(query.get('chapter_index'));
            response.setHeader('Content-Type', 'application/json');
            return response.end(JSON.stringify({revision: query.get('revision'), editor: {
                chapters: data.chapters.map(({title}) => ({title})), chapter_index: index, chapter: data.chapters[index]
            }}));
        }
        if (request.url === '/save') {
            let body = '';
            request.on('data', chunk => body += chunk);
            request.on('end', () => {
                saved = JSON.parse(body);
                response.statusCode = conflict ? 409 : 200;
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify(conflict ? { error: 'Study changed' } : { revision: 'saved-revision' }));
            });
            return;
        }
        const file = path.resolve(staticRoot, '.' + request.url);
        if (!file.startsWith(staticRoot + path.sep) || !fs.existsSync(file)) {
            response.statusCode = 404;
            return response.end();
        }
        response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        const state = () => page.evaluate(() => { const c = Alpine.$data(document.getElementById('chapter_editor')); return {pgn: c.exportPgn, dirty: c.dirty, canUndo: c.canUndo, canRedo: c.canRedo, canPromote: c.canPromote}; });
        await page.waitForSelector('cg-board');
        assert.equal(await page.locator('#editor_chapter .chapter-current-label').textContent(), '1 / 2 · First');
        await page.click('#editor_chapter');
        assert.equal(await page.locator('#editor_chapter_list [aria-current="true"]').textContent(), '1. First');
        await page.fill('#editor_chapter_list .chapter-search', 'Second');
        assert.equal(await page.locator('#editor_chapter_list .chapter-choice:visible').count(), 1);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#editor_chapter_list').isHidden(), true);
        async function square(name) {
            const box = await page.locator('cg-board').boundingBox();
            await page.mouse.click(box.x + (name.charCodeAt(0) - 97 + .5) * box.width / 8,
                box.y + (8 - Number(name[1]) + .5) * box.height / 8);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        }
        assert.equal(await page.locator('#editor_undo').isDisabled(), true);
        assert.equal(await page.locator('#editor_redo').isDisabled(), true);
        assert.equal(await page.locator('#editor_annotation').isDisabled(), true);
        assert.equal(await page.locator('#editor_delete_move').isDisabled(), true);
        await square('e2'); await square('e4');
        await page.click('#editor_delete_move');
        assert.equal(await page.locator('#editor_moves').textContent(), 'Start');
        assert.equal(await page.locator('#editor_delete_move').isDisabled(), true);
        assert.equal(await page.locator('#editor_save').isDisabled(), false);
        await page.click('#editor_undo');
        assert.ok((await page.locator('#editor_moves').textContent()).includes('e5'));
        await page.click('#editor_redo');
        assert.equal(await page.locator('#editor_moves').textContent(), 'Start');
        page.once('dialog', dialog => dialog.accept());
        await page.click('#editor_discard');
        assert.ok((await page.locator('#editor_moves').textContent()).includes('e5'));
        assert.equal(await page.locator('#editor_undo').isDisabled(), true);
        await square('e2'); await square('e4'); await square('c7'); await square('c5');
        await page.selectOption('#editor_annotation', '6');
        assert.ok((await page.locator('#editor_moves').textContent()).includes('c5?!'), JSON.stringify(await state()));
        await page.click('#editor_undo');
        assert.equal(await page.inputValue('#editor_annotation'), '0');
        await page.click('#editor_redo');
        assert.equal(await page.inputValue('#editor_annotation'), '6');
        await page.locator('#editor_moves .study-tree-promote').click();
        const main = await state();
        assert.ok(main.pgn.indexOf('c5') < main.pgn.indexOf('e5'));
        assert.equal(main.canPromote, false);
        await page.click('#editor_undo');
        assert.equal((await state()).canPromote, true);
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.press('Control+Shift+z');
        assert.equal((await state()).canPromote, false);
        await page.keyboard.press('Control+z');
        assert.equal((await state()).canPromote, true);
        await page.evaluate(() => window.addEventListener('keydown', e => {if (e.key.toLowerCase() === 'z') window.nativeUndoPrevented = e.defaultPrevented;}));
        await page.locator('#editor_comment').press('Control+z');
        assert.equal(await page.evaluate(() => window.nativeUndoPrevented), false);
        page.once('dialog', dialog => dialog.accept());
        await page.click('#editor_discard');
        await square('e2'); await square('e4');
        await square('c7'); await square('c5');
        await square('g1'); await square('f3');
        await page.locator('#editor_moves button').filter({hasText: /^c5$/}).click();
        await page.click('#editor_delete_move');
        const survivingMoves = await page.locator('#editor_moves').textContent();
        assert.ok(survivingMoves.includes('e5'));
        assert.ok(!survivingMoves.includes('c5'));
        assert.ok(!survivingMoves.includes('Nf3'));
        assert.equal(await page.locator('#editor_save').isDisabled(), true);
        await page.click('#editor_previous');
        await square('e2');
        await square('e4');
        assert.equal(await page.locator('#editor_save').isDisabled(), true);
        await square('c7');
        await square('c5');
        await page.waitForFunction(() => document.getElementById('editor_moves').textContent.includes('c5'));
        await page.fill('#editor_comment', 'New Sicilian comment');
        const analysisUrl = new URL(await page.locator('#editor_analysis').getAttribute('href'));
        const analysisPgn = decodeURIComponent(analysisUrl.pathname.slice('/analysis/pgn/'.length));
        assert.ok(analysisPgn.includes('(1... c5 { New Sicilian comment })'), 'Include unsaved variations and comments in analysis');
        page.once('dialog', dialog => dialog.dismiss());
        await page.click('#editor_chapter');
        await page.locator('#editor_chapter_list .chapter-choice').nth(1).click();
        assert.equal(await page.locator('#editor_chapter .chapter-current-label').textContent(), '1 / 2 · First');
        await page.click('#editor_save');
        await page.waitForFunction(() => document.getElementById('editor_status').textContent === 'Study changed');
        assert.equal(await page.inputValue('#editor_comment'), 'New Sicilian comment');
        assert.equal(saved.tree.root[0].children[0].move, 'e5');
        assert.equal(saved.tree.root[0].children[1].move, 'c5');
        assert.equal(saved.tree.root[0].children[1].comment, 'New Sicilian comment');
        page.once('dialog', dialog => dialog.accept());
        await page.click('#editor_discard');
        assert.equal(await page.locator('#editor_save').isDisabled(), true);
        assert.equal(await page.inputValue('#editor_comment'), '');
        await square('e2');
        await square('e4');
        await square('c7');
        await square('c5');
        await page.fill('#editor_comment', 'New Sicilian comment');
        conflict = false;
        await page.selectOption('#editor_annotation', '6');
        await page.click('#editor_promote');
        await page.click('#editor_save');
        await page.waitForFunction(() => document.getElementById('editor_status').textContent === 'Saved');
        assert.equal(saved.tree.root[0].children[0].move, 'c5');
        assert.equal(saved.tree.root[0].children[0].nags[0], 6);
        assert.equal(saved.tree.root[0].children[1].move, 'e5');
        assert.equal(await page.locator('#editor_save').isDisabled(), true);
        await page.click('#editor_undo');
        assert.equal((await state()).dirty, true);
        await page.click('#editor_redo');
        assert.equal((await state()).dirty, false);
        await page.click('#editor_chapter');
        await page.locator('#editor_chapter_list .chapter-choice').nth(1).click();
        await page.waitForFunction(() => Alpine.$data(document.getElementById('chapter_editor')).chapter === 1);
        assert.equal(await page.locator('#editor_chapter .chapter-current-label').textContent(), '2 / 2 · Second');
        await page.click('#editor_chapter');
        assert.equal(await page.locator('#editor_chapter_list [aria-current="true"]').textContent(), '2. Second');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#editor_undo').isDisabled(), true);
        await square('a7'); await square('a8');
        await page.waitForSelector('[data-promotion-picker]', { state: 'visible' });
        assert.equal(await page.locator('#editor_delete_move').isDisabled(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-promotion-picker]').isHidden(), true);
        assert.equal(await page.locator('#editor_save').isDisabled(), true);
        await square('a7'); await square('a8');
        await page.click('[data-promotion="n"]');
        await page.waitForFunction(() => document.getElementById('editor_moves').textContent.includes('a8=N'));
        assert.equal(await page.locator('#editor_save').isDisabled(), false);
        await page.click('#editor_save');
        await page.waitForFunction(() => document.getElementById('editor_status').textContent === 'Saved');
        await page.click('#editor_delete_move');
        assert.equal(await page.locator('#editor_moves').textContent(), 'Start');
        await page.click('#editor_save');
        await page.waitForFunction(() => document.getElementById('editor_status').textContent === 'Saved');
        assert.equal(saved.chapter_index, 1);
        assert.deepEqual(saved.tree.root, []);
        assert.deepEqual(errors, []);
        console.log('Chapter editor browser checks passed.');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
