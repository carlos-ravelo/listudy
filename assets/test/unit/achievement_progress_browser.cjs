const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/') {
        const bundle = url.searchParams.get('bundle');
        if (!['site', 'study', 'tactics'].includes(bundle)) { response.writeHead(404).end(); return; }
        response.setHeader('Content-Type', 'text/html');
        response.end(`<!doctype html><html lang="en"><head><meta name="csrf-token" content="test"></head>
            <body><main id="achievement_container"></main><script defer src="/js/bootstrap_${bundle}.js"></script></body></html>`);
        return;
    }
    const base = url.pathname.startsWith('/assets/js/') ? root : path.join(root, 'priv/static');
    const file = path.resolve(base, '.' + url.pathname);
    if (!file.startsWith(base + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    response.end(fs.readFileSync(file));
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
        for (const bundle of ['site', 'study', 'tactics']) {
            const context = await browser.newContext();
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => localStorage.setItem('achievements_lines_learned', '499'));
            await page.goto(`http://127.0.0.1:${server.address().port}/?bundle=${bundle}`);
            assert.equal(await page.locator('#achievement_container > div').count(), 15, `${bundle}: mount achievements through the real entry`);
            await page.evaluate(async () => {
                const { incrementAchievementCounter } = await import('/assets/js/modules/achievement_progress.js');
                incrementAchievementCounter('achievements_lines_learned');
                for (let i = 0; i < 3; i++) document.dispatchEvent(new Event('phx:update'));
            });
            for (const key of ['student', 'student2', 'student3', 'student4']) {
                assert(await page.evaluate(key => Boolean(localStorage.getItem('achievement_' + key)), key));
            }
            assert.equal(await page.evaluate(() => localStorage.getItem('achievements_total_visits')), '1');
            assert.equal(await page.locator('#achievement_container > div').count(), 15);
            assert.deepEqual(errors, []);
            await context.close();
        }
        console.log('Achievement browser entries: site, study and tactics mount all tiers without duplicate visits or lists');
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
