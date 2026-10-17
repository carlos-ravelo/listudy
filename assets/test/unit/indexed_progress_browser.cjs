const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const webpack = require('webpack');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'listudy-indexed-progress-'));
const entry = path.join(directory, 'entry.js');
fs.writeFileSync(entry, `import {createStorageAdapter} from ${JSON.stringify(path.join(root, 'assets/js/storageAdapter.js'))};\nimport {createProgressDatabase} from ${JSON.stringify(path.join(root, 'assets/js/modules/study/progress_database.js'))};\nwindow.createAdapter=createStorageAdapter; window.createDatabase=createProgressDatabase;`);
const state = (attempts, extra = {}) => JSON.stringify({version: 1, chapters: {a: {attempts, errors: 0}}, ...extra});
let remote = new Map(), offline = false;
const revision = key => remote.get(key)?.revision || '';
const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/progress')) {
        response.setHeader('Content-Type', 'application/json');
        if (offline) { response.statusCode = 503; response.end('{}'); return; }
        if (request.method === 'GET') {
            const id = url.searchParams.get('study_id');
            const records = [...remote].filter(([key]) => !id || key === `${id}_chapter_stats` || key === `${id}_chapter_reviews`);
            response.end(JSON.stringify({...Object.fromEntries(records.map(([key, record]) => [key, record.value])), _progress_user_id: '1', _progress_revisions: Object.fromEntries(records.map(([key, record]) => [key, record.revision]))}));
            return;
        }
        let body = '';
        for await (const chunk of request) body += chunk;
        const data = JSON.parse(body);
        if (data.user_id !== '1') { response.statusCode = 403; response.end('{}'); return; }
        if (data.revision !== revision(data.key)) {
            response.statusCode = 409;
            response.end(JSON.stringify({value: remote.get(data.key)?.value || null, revision: revision(data.key)}));
            return;
        }
        const next = String(Number(revision(data.key) || 0) + 1);
        remote.set(data.key, {value: data.value, revision: next});
        response.end(JSON.stringify({revision: next}));
        return;
    }
    if (url.pathname === '/bundle.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(path.join(directory, 'bundle.js'))); return; }
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><head><meta name="csrf-token" content="test"></head><body data-progress-user="1"><script>window.logged_in=true;</script><script src="/bundle.js"></script></body></html>');
});
(async () => {
    await new Promise((resolve, reject) => webpack({mode: 'development', entry, output: {path: directory, filename: 'bundle.js'}, devtool: false}, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({all: false, errors: true}))) : resolve()));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
    const errors = [];
    async function pageFor(context) {
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base);
        await page.waitForFunction(() => window.createAdapter);
        return page;
    }
    try {
        const context = await browser.newContext(), page = await pageFor(context);
        remote.set('study_chapter_stats', {value: state(3), revision: '7'});
        const migration = await page.evaluate(async () => {
            const key = 'progress:user:1:study_chapter_stats';
            const value = JSON.stringify({version: 1, chapters: {a: {attempts: 5, errors: 0}}, sparringSessions: {saved: {id: 'saved', pgn: '1. e4 e5', reviews: [{grade: 'best'}]}}});
            localStorage.setItem(key, value);
            localStorage.setItem(key + ':sync', JSON.stringify({revision: '7', value: JSON.stringify({version: 1, chapters: {a: {attempts: 3, errors: 0}}}), pending: true}));
            localStorage.setItem(key + ':backup', value);
            localStorage.setItem('study_chapter_stats', JSON.stringify({version: 1, chapters: {a: {attempts: 90}}}));
            localStorage.setItem('progress:user:2:study_chapter_stats', JSON.stringify({version: 1, chapters: {a: {attempts: 22}}}));
            localStorage.setItem('study_tree', '[{"headers":{},"root":[],"comments":"legacy tree"}]');
            let chunks = 0;
            try { for (;;) localStorage.setItem(`test-filler-${chunks++}`, 'x'.repeat(50000)); } catch (error) { if (error.name !== 'QuotaExceededError') throw error; }
            window.adapter = createAdapter();
            const ready = await adapter.ready('study');
            const database = createDatabase();
            const record = await database.get(key);
            const owned = JSON.parse(adapter.getItem('study_chapter_stats'));
            return {ready, chunks, attempts: owned.chapters.a.attempts, report: owned.sparringSessions.saved,
                pending: record.pending, base: JSON.parse(record.base).chapters.a.attempts,
                removed: [key, key + ':sync', key + ':backup', 'study_tree'].every(key => localStorage.getItem(key) === null),
                noDuplicateBackup: !(await database.get(key + ':backup', 'archive')),
                legacyTree: await adapter.legacyTree('study_tree'), guest: JSON.parse((await database.get('study_chapter_stats')).value).chapters.a.attempts};
        });
        assert(migration.ready && migration.chunks > 0 && migration.removed && migration.noDuplicateBackup);
        assert.equal(migration.attempts, 5); assert.equal(migration.base, 3); assert(migration.pending);
        assert.equal(migration.guest, 90); assert.equal(migration.report.pgn, '1. e4 e5');
        assert(migration.legacyTree.includes('legacy tree'));
        await page.evaluate(async () => {
            const stats = JSON.parse(adapter.getItem('study_chapter_stats')); stats.chapters.a.errors++;
            adapter.setItem('study_chapter_stats', JSON.stringify(stats));
            if (!await adapter.whenSaved()) throw Error('Durable write failed');
            adapter.setItem('study_tree', 'must not be saved');
            await adapter._flush('study_chapter_stats');
        });
        const ack = await page.evaluate(async () => createDatabase().get('progress:user:1:study_chapter_stats'));
        assert.equal(ack.base, null); assert.equal(ack.pending, false); assert.equal(JSON.parse(ack.value).chapters.a.errors, 1);
        assert.equal(JSON.parse(remote.get('study_chapter_stats').value).chapters.a.attempts, 5);
        offline = true;
        await page.reload(); await page.waitForFunction(() => window.createAdapter);
        assert.equal(await page.evaluate(async () => { window.adapter = createAdapter(); await adapter.hydrate('study'); return JSON.parse(adapter.getItem('study_chapter_stats')).chapters.a.errors; }), 1);
        const isolation = await page.evaluate(async () => {
            document.body.dataset.progressUser = '2'; window.adapter = createAdapter(); await adapter.ready('study');
            return JSON.parse(adapter.getItem('study_chapter_stats')).chapters.a.attempts;
        });
        assert.equal(isolation, 22);
        const big = await page.evaluate(async () => {
            document.body.removeAttribute('data-progress-user'); window.logged_in = false; window.adapter = createAdapter(); await adapter.ready('big');
            const value = JSON.stringify({version: 1, chapters: {}, sparringSessions: {large: {pgn: 'x'.repeat(6 * 1024 * 1024)}}});
            adapter.setItem('big_chapter_stats', value); if (!await adapter.whenSaved()) throw Error('Large write failed');
            return {size: (await createDatabase().get('big_chapter_stats')).value.length, local: localStorage.getItem('big_chapter_stats')};
        });
        assert(big.size > 6 * 1024 * 1024); assert.equal(big.local, null);
        await context.close();
        console.log('Full localStorage migration, verified cleanup, ownership, legacy trees, sparring reports, offline reload and >5 MiB documents passed');

        offline = false; remote = new Map();
        const deviceA = await browser.newContext(), deviceB = await browser.newContext();
        const a = await pageFor(deviceA), b = await pageFor(deviceB);
        for (const page of [a, b]) await page.evaluate(async () => {window.adapter = createAdapter(); await adapter.hydrate('test'); adapter.getItem('test_chapter_stats');});
        await a.evaluate(async () => {adapter.setItem('test_chapter_stats', JSON.stringify({version: 1, chapters: {a: {attempts: 1, errors: 0}}})); await adapter.whenSaved();});
        await b.evaluate(async () => {adapter.setItem('test_chapter_stats', JSON.stringify({version: 1, chapters: {b: {attempts: 1, errors: 0}}})); await adapter.whenSaved();});
        await Promise.all([a.evaluate(() => adapter._flush('test_chapter_stats')), b.evaluate(() => adapter._flush('test_chapter_stats'))]);
        assert.equal(JSON.parse(remote.get('test_chapter_stats').value).chapters.a.attempts, 1);
        assert.equal(JSON.parse(remote.get('test_chapter_stats').value).chapters.b.attempts, 1);
        await a.evaluate(() => adapter.hydrate('test'));
        const tab = await pageFor(deviceA);
        await tab.evaluate(async () => {window.adapter = createAdapter(); await adapter.ready('test'); adapter.getItem('test_chapter_stats');});
        await a.evaluate(async () => {
            const db = createDatabase(); let release;
            const gate = new Promise(resolve => release = resolve); window.releaseWrite = release;
            const update = db.update;
            db.update = async (...args) => { await gate; return update(...args); };
            window.adapter = createAdapter({database: db}); await adapter.ready('test');
            const stats = JSON.parse(adapter.getItem('test_chapter_stats')); stats.chapters.a.attempts++;
            adapter.setItem('test_chapter_stats', JSON.stringify(stats));
        });
        await tab.evaluate(async () => {const stats = JSON.parse(adapter.getItem('test_chapter_stats')); stats.chapters.a.attempts++; adapter.setItem('test_chapter_stats', JSON.stringify(stats)); await adapter.whenSaved();});
        await a.evaluate(async () => { releaseWrite(); await adapter.whenSaved(); });
        const combined = await a.evaluate(async () => JSON.parse((await createDatabase().get('progress:user:1:test_chapter_stats')).value));
        assert.equal(combined.chapters.a.attempts, 3, 'Two tabs retain both identical increments');
        await a.evaluate(() => adapter._flush('test_chapter_stats'));
        assert.equal(JSON.parse(remote.get('test_chapter_stats').value).chapters.a.attempts, 3);
        await deviceA.close(); await deviceB.close();
        console.log('IndexedDB transactions across tabs and two-device revision conflicts passed');

        const auditContext = await browser.newContext(), audit = await pageFor(auditContext);
        const checks = await audit.evaluate(async () => {
            const db = createDatabase(), update = db.update;
            let transactions = 0;
            db.update = (...args) => { transactions++; return update(...args); };
            window.adapter = createAdapter({database: db}); await adapter.ready('batch');
            for (let attempts = 1; attempts <= 20; attempts++) {
                adapter.getItem('batch_chapter_stats');
                adapter.setItem('batch_chapter_stats', JSON.stringify({version: 1, chapters: {a: {attempts}}}));
            }
            await adapter.whenSaved();
            const batchTransactions = transactions;
            const attempts = JSON.parse((await db.get('progress:user:1:batch_chapter_stats')).value).chapters.a.attempts;
            window.adapter = createAdapter(); await adapter.ready('unopened'); await adapter.forceSyncAll();
            await adapter._flush('batch_chapter_stats');
            const synced = !(await db.get('progress:user:1:batch_chapter_stats')).pending;
            const original = JSON.stringify({version: 1, chapters: {a: {attempts: 8}}});
            const key = 'progress:user:1:verification_chapter_stats';
            localStorage.setItem(key, original);
            const corrupt = createDatabase(); corrupt.get = async () => null;
            const verification = await createAdapter({database: corrupt}).ready('verification');
            return {batchTransactions, attempts, synced, verification, originalRetained: localStorage.getItem(key) === original};
        });
        assert.equal(checks.batchTransactions, 1); assert.equal(checks.attempts, 20);
        assert(checks.synced && checks.originalRetained); assert.equal(checks.verification, false);
        await auditContext.close();
        console.log('Writes are batched, unopened pending studies synchronize and failed verification retains the original');

        const blockedContext = await browser.newContext(), blocked = await pageFor(blockedContext);
        const fallback = await blocked.evaluate(async () => {
            const value = JSON.stringify({version: 1, chapters: {a: {attempts: 4, errors: 0}}});
            const key = 'progress:user:1:blocked_chapter_stats';
            localStorage.setItem(key, value);
            const unavailable = {get: async () => {throw Error('unavailable');}, update: async () => {throw Error('unavailable');}, list: async () => {throw Error('unavailable');}, archive: async () => {throw Error('unavailable');}};
            const protectedStorage = {get length() {return localStorage.length;}, key: index => localStorage.key(index), getItem: key => localStorage.getItem(key), setItem() {throw new DOMException('Full', 'QuotaExceededError');}, removeItem() {throw Error('Must not remove unverified data');}};
            const statuses = []; window.addEventListener('study-sync-status', event => statuses.push(event.detail.state));
            window.adapter = createAdapter({database: unavailable, storage: protectedStorage});
            const ready = await adapter.ready('blocked');
            const current = JSON.parse(adapter.getItem('blocked_chapter_stats')); current.chapters.a.attempts++;
            adapter.setItem('blocked_chapter_stats', JSON.stringify(current));
            const saved = await adapter.whenSaved();
            await adapter._flush('blocked_chapter_stats');
            return {ready, saved, original: localStorage.getItem(key) === value, current: JSON.parse(adapter.getItem('blocked_chapter_stats')).chapters.a.attempts, statuses};
        });
        assert.equal(fallback.ready, false); assert.equal(fallback.saved, false); assert(fallback.original);
        assert.equal(fallback.current, 5); assert(fallback.statuses.includes('storage-error'));
        assert.equal(JSON.parse(remote.get('blocked_chapter_stats').value).chapters.a.attempts, 5, 'Disk failure must not prevent cloud sync');
        await blockedContext.close();
        assert.deepEqual(errors, []);
        console.log('Unavailable IndexedDB + exhausted localStorage preserves originals, reports failure and still synchronizes without uncaught promises');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(directory, {recursive: true, force: true});
    }
})().catch(error => {console.error(error); server.close(); process.exitCode = 1;});
