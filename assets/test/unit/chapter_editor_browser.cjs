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
    { title: 'Second', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', comment: '', root: [] }
] };
const html = `<!doctype html><html class="blue cburnett"><head>
<meta name="csrf-token" content="test"><link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="/css/chessground.css"></head><body><main class="container">
<section id="chapter_editor" class="chapter-editor" x-data="chapterEditor" @beforeunload.window="beforeLeave($event)" data-editor="${escape(JSON.stringify(data))}"
data-revision="original" data-save-url="/save" data-color="white" data-start="Start"
data-variation="Variation" data-discard-prompt="Discard?" data-saving="Saving"
data-save-error="Save failed" data-unsaved="Unsaved" data-invalid-move="Illegal">
<select id="editor_chapter" :disabled="saving" :value="chapter" @change="changeChapter($event)">
<template x-for="(option, index) in options" :key="index"><option :value="index" x-text="option.title" :selected="index === chapter"></option></template></select>
<button id="editor_save" :disabled="saving || !dirty" @click="save()">Save</button>
<button id="editor_discard" :disabled="saving || !dirty" @click="discard()">Discard</button>
<div class="chapter-editor-layout"><div><div id="editor_board" class="cg-wrap" x-ref="board"></div>
<button id="editor_previous" :disabled="saving || !hasPrevious" @click="previous()">Previous</button><button id="editor_next" :disabled="saving || !hasNext" @click="next()">Next</button>
<select id="editor_promotion" x-model="promotion" :disabled="saving"><option value="q">Queen</option><option value="n">Knight</option></select></div>
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
        if (request.url === '/save') {
            let body = '';
            request.on('data', chunk => body += chunk);
            request.on('end', () => {
                saved = JSON.parse(body);
                response.statusCode = conflict ? 409 : 200;
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify(conflict ? { error: 'Study changed' } : { url: '/saved' }));
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
        await page.waitForSelector('cg-board');
        async function square(name) {
            const box = await page.locator('cg-board').boundingBox();
            await page.mouse.click(box.x + (name.charCodeAt(0) - 97 + .5) * box.width / 8,
                box.y + (8 - Number(name[1]) + .5) * box.height / 8);
        }
        await square('e2');
        await square('e4');
        assert.equal(await page.locator('#editor_save').isDisabled(), true);
        await square('c7');
        await square('c5');
        await page.waitForFunction(() => document.getElementById('editor_moves').textContent.includes('c5'));
        await page.fill('#editor_comment', 'New Sicilian comment');
        page.once('dialog', dialog => dialog.dismiss());
        await page.selectOption('#editor_chapter', '1');
        assert.equal(await page.inputValue('#editor_chapter'), '0');
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
        await page.click('#editor_save');
        await page.waitForURL('**/saved');
        assert.deepEqual(errors, []);
        console.log('Chapter editor browser checks passed.');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
