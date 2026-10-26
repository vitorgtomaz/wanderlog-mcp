import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const env = { MCP_ACCESS_TOKEN: 'test-access-token', WANDERLOG_COOKIE: 's%3Atest-cookie' };
const call = (method, args = {}, options = {}) => worker.fetch(new Request('https://example.com/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.MCP_ACCESS_TOKEN}`, ...options.headers },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: args }),
}), options.env ?? env);

test('fails closed without server token or with wrong bearer', async () => {
  assert.equal((await call('tools/list', {}, { env: {} })).status, 503);
  assert.equal((await call('tools/list', {}, { headers: { authorization: 'Bearer wrong' } })).status, 401);
});
test('blocks cross-origin calls and exposes only read tools', async () => {
  assert.equal((await call('tools/list', {}, { headers: { origin: 'https://evil.example' } })).status, 403);
  const response = await (await call('tools/list')).json();
  assert.equal(response.result.tools.length, 3);
  assert.ok(response.result.tools.every(t => t.annotations.readOnlyHint));
});
test('reports missing cookie and rejects invalid trip keys without upstream requests', async () => {
  const response = await (await call('tools/call', { name: 'wanderlog_connection_status' }, { env: { MCP_ACCESS_TOKEN: env.MCP_ACCESS_TOKEN } })).json();
  assert.match(response.result.content[0].text, /setup_needed/);
  const invalid = await (await call('tools/call', { name: 'wanderlog_get_trip_snapshot', arguments: { trip_key: '../user' } })).json();
  assert.equal(invalid.result.isError, true);
});
test('uses GET only, fixed upstream host, cookie header and no view registration', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://wanderlog.com/api/tripPlans/abc?clientSchemaVersion=2');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.Cookie, 'connect.sid=s%3Atest-cookie');
    return Response.json({ tripPlan: { title: 'Test trip' } });
  };
  try {
    const response = await (await call('tools/call', { name: 'wanderlog_get_trip_snapshot', arguments: { trip_key: 'abc' } })).json();
    assert.equal(response.result.isError, false);
    assert.match(response.result.content[0].text, /Test trip/);
    assert.ok(!JSON.stringify(response).includes(env.WANDERLOG_COOKIE));
  } finally { globalThis.fetch = original; }
});
test('does not leak upstream exception text or cookies', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error(env.WANDERLOG_COOKIE); };
  try {
    const response = await call('tools/call', { name: 'wanderlog_connection_status' });
    const text = await response.text();
    assert.ok(!text.includes(env.WANDERLOG_COOKIE));
    assert.equal(JSON.parse(text).result.isError, true);
  } finally { globalThis.fetch = original; }
});
