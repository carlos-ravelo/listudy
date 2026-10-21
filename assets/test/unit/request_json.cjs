const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calls = [];
let metaToken = 'meta-token', formToken, respond;
const context = vm.createContext({
    document: { querySelector(selector) {
        return selector.startsWith('meta') ? { getAttribute: () => metaToken } : { value: formToken };
    } },
    fetch(url, options) { calls.push({ url, options }); return respond(options); }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/modules/request_json.js'), 'utf8')
    .replace(/^export /gm, ''), context);
const request = context.requestJson;
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

(async () => {
    respond = async () => response(200, { revision: 'next' });
    const result = await request('/save', { method: 'post', body: { revision: 'old', chapters: [] } });
    assert.equal(result.revision, 'next');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[0].options.headers['x-csrf-token'], 'meta-token');
    assert.equal(calls[0].options.headers.Accept, 'application/json');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].options.body), { revision: 'old', chapters: [] });

    metaToken = ''; formToken = 'form-token';
    await request('/save', { method: 'POST', body: {} });
    assert.equal(calls.at(-1).options.headers['x-csrf-token'], 'form-token');
    formToken = '';
    const beforeMissingToken = calls.length;
    await assert.rejects(request('/save', { method: 'POST', errorMessage: 'No se pudo guardar' }),
        { message: 'No se pudo guardar' });
    assert.equal(calls.length, beforeMissingToken, 'Do not send writes without a CSRF token');

    const controller = new AbortController();
    await request('/chapter?revision=old', { signal: controller.signal });
    assert.equal(calls.at(-1).options.signal, controller.signal);
    assert.equal(calls.at(-1).options.body, undefined);
    assert.equal(calls.at(-1).options.headers['Content-Type'], undefined);
    assert.equal(calls.at(-1).options.headers['x-csrf-token'], undefined);

    metaToken = 'token';
    const conflict = { error: 'Study changed', revision: 'current' };
    respond = async () => response(409, conflict);
    const beforeConflict = calls.length;
    await assert.rejects(request('/save', { method: 'POST', body: { revision: 'old' } }), error => {
        assert.equal(error.name, 'JsonRequestError');
        assert.equal(error.status, 409);
        assert.equal(error.data, conflict);
        assert.equal(error.message, 'Study changed');
        return true;
    });
    assert.equal(calls.length, beforeConflict + 1, 'Never retry writes automatically');

    for (const data of [null, {}, { error: '' }, { error: { internal: 'details' } }]) {
        respond = async () => response(503, data);
        await assert.rejects(request('/chapter', { errorMessage: 'No se pudo cargar' }),
            { name: 'JsonRequestError', status: 503, message: 'No se pudo cargar' });
    }
    for (const status of [200, 502]) {
        respond = async () => ({ ...response(status), json: async () => { throw new SyntaxError('HTML response'); } });
        await assert.rejects(request('/chapter', { errorMessage: 'No se pudo cargar' }),
            { name: 'JsonRequestError', status, message: 'No se pudo cargar', data: null });
    }
    const networkError = new TypeError('Failed to fetch');
    respond = async () => { throw networkError; };
    await assert.rejects(request('/chapter'), error => error === networkError);
    const aborted = new DOMException('Cancelled', 'AbortError');
    respond = options => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(aborted), { once: true });
    });
    const pending = request('/chapter', { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, error => error === aborted);
    respond = async () => ({ ...response(200), json: async () => { throw aborted; } });
    await assert.rejects(request('/chapter'), error => error === aborted);
    console.log('JSON transport: CSRF, revisions, HTTP errors, invalid responses, cancellation and no retries passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
