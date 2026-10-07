const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const chapters = [
    { id: 'a'.repeat(32), source_index: 0, title: 'First', moves: 2 },
    { id: 'b'.repeat(32), source_index: 1, title: 'Second', moves: 2 }
];
const template = fs.readFileSync(path.join(root, 'lib/listudy_web/templates/study/edit.html.eex'), 'utf8');
const section = template.match(/<section class="study-maintenance"[\s\S]*?<\/section>/)[0]
    .replace('<%= @chapters_json %>', JSON.stringify(chapters).replace(/"/g, '&quot;'))
    .replace('<%= @revision %>', 'revision')
    .replace(/<%= Routes\.study_path\([^%]+%>/g, expression => expression.includes(':manage_chapters') ? '/save' : '/editor')
    .replace(/<%= dgettext\("study", "([^"]+)"\) %>/g, '$1');
const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="test"><link rel="stylesheet" href="/css/app.css"></head><body><main>${section}</main><script src="/js/study_maintenance.js"></script></body></html>`;

(async () => {
    let saved, conflict = true;
    const server = http.createServer((request, response) => {
        if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
        if (request.url === '/saved') { response.end('Saved'); return; }
        if (request.url === '/save') {
            let body = '';
            request.on('data', chunk => { body += chunk; });
            request.on('end', () => {
                saved = JSON.parse(body);
                assert.equal(request.headers['x-csrf-token'], 'test');
                response.statusCode = conflict ? 409 : 200;
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify(conflict ? { error: 'Study changed' } : { url: '/saved' }));
            });
            return;
        }
        const file = path.resolve(root, 'priv/static', '.' + request.url);
        if (!file.startsWith(path.join(root, 'priv/static') + path.sep) || !fs.existsSync(file)) {
            response.statusCode = 404; response.end(); return;
        }
        response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        const rows = page.locator('.study-maintenance-row');
        await rows.nth(1).waitFor();
        const save = page.getByRole('button', { name: 'Save chapter changes', exact: true });
        assert.equal(await save.isDisabled(), true);
        await rows.first().locator('input').fill('Renamed');
        assert.equal(await save.isDisabled(), false);
        await rows.nth(1).getByRole('button', { name: 'Move chapter up' }).click();
        assert.equal(await rows.first().locator('input').inputValue(), 'Second');
        assert.equal(await rows.first().getByRole('link', { name: 'Edit' }).getAttribute('href'), '/editor?chapter_index=1');
        page.once('dialog', dialog => dialog.dismiss());
        await rows.first().getByRole('link', { name: 'Edit' }).click();
        assert(page.url().endsWith('/'));
        await rows.nth(1).locator('summary').click();
        await rows.nth(1).getByRole('button', { name: 'Duplicate', exact: true }).click();
        assert.equal(await rows.count(), 3);
        await page.getByRole('button', { name: 'Add chapter' }).click();
        assert.equal(await rows.count(), 4);
        await rows.nth(3).locator('input').fill('Fresh');
        await rows.first().locator('summary').click();
        page.once('dialog', dialog => dialog.accept());
        await rows.first().getByRole('button', { name: 'Delete', exact: true }).click();
        assert.equal(await rows.count(), 3);
        await page.setViewportSize({ width: 390, height: 844 });
        const title = await rows.first().locator('input').boundingBox();
        const actions = await rows.first().locator('.study-maintenance-actions').boundingBox();
        assert(actions.y >= title.y + title.height);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        await save.click();
        await page.getByRole('status').filter({ hasText: 'Study changed' }).waitFor();
        assert.equal(await rows.first().locator('input').inputValue(), 'Renamed');
        assert.equal(saved.chapters.length, 3);
        assert.equal(saved.chapters[1].duplicate, true);
        assert.notEqual(saved.chapters[1].id, chapters[0].id);
        assert.equal(saved.chapters[2].source_index, null);
        assert.equal(saved.chapters[2].title, 'Fresh');
        conflict = false;
        await save.click();
        await page.waitForURL('**/saved');
        assert.deepEqual(errors, []);
        console.log('Study maintenance browser checks passed.');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
