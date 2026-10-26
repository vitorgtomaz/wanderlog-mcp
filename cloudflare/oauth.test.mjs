import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';

// Execute the real OAuth library with an in-memory KV adapter. The single
// platform import only supplies the WorkerEntrypoint base class in these tests.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export class WorkerEntrypoint {}', shortCircuit: true };
    return next(specifier, context);
  },
});
const worker = (await import('./dist/worker.mjs')).default;
class MemoryRuntime {
  constructor() {
    const values = new Map();
    this.env = { MCP_ACCESS_TOKEN: password, AUTH_LIMITER: { limit: async () => ({ success: true }) }, OAUTH_KV: {
      async get(key, type) { const value = values.get(key); if (!value || value.expires < Date.now()) return null; return (type === 'json' || type?.type === 'json') ? JSON.parse(value.text) : value.text; },
      async put(key, value, options = {}) { values.set(key, { text: value, expires: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : Infinity }); },
      async delete(key) { values.delete(key); },
      async list({ prefix = '' } = {}) { return { keys: [...values.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
    } };
  }
  async dispatchFetch(url, init) { return worker.fetch(new Request(url, init), this.env, { waitUntil() {}, passThroughOnException() {} }); }
  async dispose() {}
}

const origin = 'https://wanderlog-consulta-privada.vitorgtomaz.workers.dev';
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
const password = 'fixture-owner-password-32-characters';
const verifier = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const challenge = createHash('sha256').update(verifier).digest('base64url');

test('OAuth discovery, consent, PKCE, replay rejection, refresh and protected MCP with memory KV', async () => {
  const mf = new MemoryRuntime();
  const send = (path, init) => mf.dispatchFetch(origin + path, init);
  const register = body => send('/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const token = body => send('/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
  try {
    const denied = await send('/mcp', { method: 'POST' });
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get('www-authenticate'), /resource_metadata/);
    const metadata = await (await send('/.well-known/oauth-authorization-server')).json();
    assert.ok(metadata.code_challenge_methods_supported.includes('S256'));
    assert.equal(metadata.issuer, origin);
    assert.equal(metadata.registration_endpoint, origin + '/register');
    assert.equal((await register({ redirect_uris: ['https://evil.example/callback'] })).status, 400);
    const clientResponse = await register({ client_name: 'ChatGPT test', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' });
    assert.equal(clientResponse.status, 201);
    const client = await clientResponse.json();
    const params = { response_type: 'code', client_id: client.client_id, redirect_uri: redirect, scope: 'wanderlog:read offline_access', state: 'fixture-state', code_challenge: challenge, code_challenge_method: 'S256', resource: origin + '/mcp' };
    const get = await send('/authorize?' + new URLSearchParams(params));
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('referrer-policy'), 'same-origin');
    assert.match(get.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const cookie = get.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    const html = await get.text();
    assert.ok(!html.includes(password));
    const handle = html.match(/name="handle" value="([^"]+)"/)[1];
    const consent = (key, extra = {}) => send('/authorize', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin, cookie, ...extra }, body: new URLSearchParams({ handle, owner_key: key, decision: 'approve' }).toString() });
    assert.equal((await consent(password, { cookie: '' })).status, 400);
    assert.equal((await consent(password, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await consent('wrong')).status, 403);
    const approved = await consent(password);
    assert.equal(approved.status, 302);
    const location = new URL(approved.headers.get('location'));
    assert.equal(location.origin, 'https://chatgpt.com');
    assert.equal(location.searchParams.get('state'), 'fixture-state');
    assert.equal(location.searchParams.get('iss'), origin);
    assert.equal((await consent(password)).status, 400);
    const exchange = { grant_type: 'authorization_code', client_id: client.client_id, code: location.searchParams.get('code'), redirect_uri: redirect, code_verifier: verifier, resource: origin + '/mcp' };
    const result = await token(exchange);
    assert.equal(result.status, 200, await result.clone().text());
    const credentials = await result.json();
    assert.ok(credentials.access_token && credentials.refresh_token);
    const call = access => send('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + access }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    const list = await call(credentials.access_token);
    assert.equal(list.status, 200, await list.clone().text());
    assert.equal((await list.json()).result.tools.length, 3);
    assert.equal((await call(password)).status, 401, 'owner password must not work as an MCP bearer token');
    const refreshed = await token({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: credentials.refresh_token, resource: origin + '/mcp' });
    assert.equal(refreshed.status, 200, await refreshed.clone().text());
    const next = await refreshed.json();
    assert.notEqual(next.access_token, credentials.access_token);
    assert.equal((await call(next.access_token)).status, 200);
    assert.equal((await token(exchange)).status, 400);
    assert.equal((await call(next.access_token)).status, 401, 'code replay revokes the grant');
    const badPkce = await send('/authorize?' + new URLSearchParams({ ...params, code_challenge_method: 'plain' }));
    assert.equal(badPkce.status, 400);
  } finally { await mf.dispose(); }
});
