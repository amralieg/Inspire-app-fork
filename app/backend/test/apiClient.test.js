const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'apiClient.js')).href;
const load = () => import(libUrl);

function withFetch(responder, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const { status = 200, text = '' } = responder(url, opts);
    return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
  };
  return Promise.resolve(run(calls)).finally(() => { globalThis.fetch = original; });
}

test('both helpers send the token and workspace host headers, and POST sends JSON', async () => {
  const { makeApiFetch, makeApiPostJson } = await load();
  await withFetch(() => ({ text: '{"ok":true}' }), async (calls) => {
    const get = makeApiFetch({ token: 'tok', databricksHost: 'https://h' });
    const post = makeApiPostJson({ token: 'tok', databricksHost: 'https://h' });
    assert.deepEqual(await get('/api/a'), { ok: true });
    assert.deepEqual(await post('/api/b', { x: 1 }), { ok: true });
    assert.deepEqual(calls[0].opts.headers, { Authorization: 'Bearer tok', 'X-DB-PAT-Token': 'tok', 'X-Databricks-Host': 'https://h' });
    assert.equal(calls[1].opts.method, 'POST');
    assert.equal(calls[1].opts.body, '{"x":1}');
    assert.deepEqual(calls[1].opts.headers, {
      'Content-Type': 'application/json', Authorization: 'Bearer tok', 'X-DB-PAT-Token': 'tok', 'X-Databricks-Host': 'https://h',
    });
  });
});

test('without a token or host no auth headers are sent', async () => {
  const { makeApiFetch, makeApiPostJson } = await load();
  await withFetch(() => ({ text: '{}' }), async (calls) => {
    await makeApiFetch()('/api/a');
    await makeApiPostJson({})('/api/b', {});
    assert.deepEqual(calls[0].opts.headers, {});
    assert.deepEqual(calls[1].opts.headers, { 'Content-Type': 'application/json' });
  });
});

test('an error keeps the status, the server error text and the parsed body with its details', async () => {
  const { makeApiFetch, makeApiPostJson } = await load();
  const body = { missing_tables: [{ table: 'main.s.orders', reason: 'not found' }], error: 'the preview cannot run' };
  await withFetch(() => ({ status: 409, text: JSON.stringify(body) }), async () => {
    const postErr = await makeApiPostJson({ token: 't' })('/api/x', {}).catch((e) => e);
    assert.equal(postErr.message, '409: the preview cannot run');
    assert.deepEqual(postErr.body, body);
    const getErr = await makeApiFetch({ token: 't' })('/api/x').catch((e) => e);
    assert.equal(getErr.message, '409: the preview cannot run');
    assert.deepEqual(getErr.body, body);
  });
});

test('a structured error is stringified, plain text is kept as the message, and an empty reply shows the status', async () => {
  const { makeApiPostJson } = await load();
  const post = makeApiPostJson({ token: 't' });
  await withFetch(() => ({ status: 400, text: '{"error":{"code":"BAD","why":"x"}}' }), async () => {
    const err = await post('/api/x', {}).catch((e) => e);
    assert.equal(err.message, '400: {"code":"BAD","why":"x"}');
    assert.deepEqual(err.body, { error: { code: 'BAD', why: 'x' } });
  });
  await withFetch(() => ({ status: 502, text: 'Bad Gateway' }), async () => {
    const err = await post('/api/x', {}).catch((e) => e);
    assert.equal(err.message, '502: Bad Gateway');
    assert.equal(err.body, null);
  });
  await withFetch(() => ({ status: 500, text: '' }), async () => {
    const err = await post('/api/x', {}).catch((e) => e);
    assert.equal(err.message, '500: 500');
    assert.equal(err.body, null);
  });
  await withFetch(() => ({ status: 500, text: 'null' }), async () => {
    const err = await post('/api/x', {}).catch((e) => e);
    assert.equal(err.message, '500: null');
    assert.equal(err.body, null);
  });
});
