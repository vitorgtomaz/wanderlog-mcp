import OAuthProvider, { AuthorizationError, CimdFetchError, insufficientScope } from '@cloudflare/workers-oauth-provider';
import { mcpHandler, validToken } from './worker.mjs';

const ORIGIN = 'https://wanderlog-consulta-privada.vitorgtomaz.workers.dev';
const RESOURCE = `${ORIGIN}/mcp`;
const READ_SCOPE = 'wanderlog:read';
const escape = value => String(value).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');
const text = (message, status = 400) => new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

export function allowedRedirect(uri) {
  try {
    const u = new URL(uri);
    return u.origin === 'https://chatgpt.com' && !u.username && !u.password && !u.hash && !u.search &&
      (u.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(u.pathname));
  } catch { return false; }
}

function page(details, handle) {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar Wanderlog</title>
<style>body{font:17px system-ui;color:#18352e;background:#f5f7f4;max-width:520px;margin:8vh auto;padding:24px}main{background:white;border:1px solid #dce5dc;border-radius:20px;padding:30px}h1{font-size:28px}label,input{display:block}input{box-sizing:border-box;width:100%;padding:12px;margin:10px 0 20px;border:1px solid #8ba294;border-radius:8px;font-size:18px}button{padding:12px 18px;border:0;border-radius:8px;background:#165e49;color:white;font-size:16px;cursor:pointer}button[value=deny]{background:#e8eee9;color:#18352e;margin-left:8px}small{display:block;margin-top:20px;line-height:1.5}</style>
<main><h1>Conectar Wanderlog</h1><p><strong>${escape(details.clientName)}</strong> solicita acesso somente para consultar suas viagens.</p>
<p>Permissões: ${escape(details.scope.join(', '))}.</p><p>O acesso será enviado para <strong>${escape(details.redirectHost)}</strong>. ${details.clientDomain ? `Cliente publicado por ${escape(details.clientDomain)}.` : 'O nome do cliente é autodeclarado.'}</p>
<form method="post" action="/authorize"><input type="hidden" name="handle" value="${escape(handle)}"><label for="owner-key">Chave de conexão</label><input id="owner-key" type="password" name="owner_key" autocomplete="off" maxlength="4096" placeholder="Seu MCP_ACCESS_TOKEN"><button name="decision" value="approve">Autorizar consulta</button><button name="decision" value="deny">Cancelar</button></form>
<small>Use o valor de MCP_ACCESS_TOKEN que você salvou no Cloudflare. Não use sua senha nem o cookie do Wanderlog. A conexão é mantida na nuvem.</small></main></html>`;
}

async function authorize(request, env) {
  const oauth = env.OAUTH_PROVIDER;
  if (!env.MCP_ACCESS_TOKEN || !env.OAUTH_KV) return text('Configuração do servidor incompleta.', 503);
  try {
    if (request.method === 'GET') {
      const auth = await oauth.parseAuthRequest(request);
      if (!allowedRedirect(auth.redirectUri)) return text('Destino de autorização não permitido. Inicie a conexão pelo plugin no ChatGPT.');
      if (!auth.codeChallenge || auth.codeChallengeMethod !== 'S256') return text('Esta conexão exige PKCE S256.');
      if (!auth.scope.includes(READ_SCOPE) || auth.scope.some(s => ![READ_SCOPE, 'offline_access'].includes(s))) return text('Permissões de consulta inválidas.');
      const details = await oauth.describeConsent(auth);
      const consent = await oauth.beginConsent(auth);
      consent.headers.set('Content-Type', 'text/html; charset=utf-8');
      consent.headers.set('Cache-Control', 'no-store');
      // HTML form POSTs can send Origin:null under no-referrer. Keep the
      // origin on same-origin submissions without leaking the auth URL out.
      consent.headers.set('Referrer-Policy', 'same-origin');
      consent.headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      return new Response(page(details, consent.handle), { headers: consent.headers });
    }
    if (request.method !== 'POST') return text('Método não permitido.', 405);
    if (request.headers.get('origin') !== ORIGIN) return text('Origem inválida.', 403);
    if (!env.AUTH_LIMITER || !(await env.AUTH_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' })).success) return text('Muitas tentativas. Aguarde um minuto e tente novamente.', 429);
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return text('Formato inválido.', 415);
    // Cap the streamed form body before parsing. Never log form data.
    const reader = request.body?.getReader();
    if (!reader) return text('Formulário vazio.');
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) { await reader.cancel(); return text('Formulário muito grande.', 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const handle = form.get('handle') ?? '';
    if (form.get('decision') === 'deny') {
      const denied = await oauth.denyConsent(request, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    if (form.get('decision') !== 'approve') return text('Decisão inválida.');
    const password = form.get('owner_key') ?? '';
    if (!password || password.length > 4096 || !(await validToken(password, env.MCP_ACCESS_TOKEN))) return text('Chave incorreta. Volte à página anterior e use o MCP_ACCESS_TOKEN salvo no Cloudflare.', 403);
    const approved = await oauth.approveConsent(request, handle);
    if (!allowedRedirect(approved.request.redirectUri)) return text('Destino inválido.', 403);
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request, userId: 'owner', metadata: { label: 'Wanderlog privado' }, scope: approved.request.scope,
      props: { userId: 'owner', credentialVersion: await hash(env.MCP_ACCESS_TOKEN) },
    });
    approved.headers.set('Location', redirectTo);
    approved.headers.set('Cache-Control', 'no-store');
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) return text('A autorização expirou ou é inválida. Inicie novamente pelo botão Conectar do plugin.');
    return text('Não foi possível concluir a autorização. Tente novamente.', 500);
  }
}

const provider = new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: {
    async fetch(request, env, ctx) {
      if (!ctx.auth.scope.includes(READ_SCOPE)) return insufficientScope(ctx.auth, [READ_SCOPE]);
      if (!env.MCP_ACCESS_TOKEN || ctx.props.userId !== 'owner' || !(await validToken(ctx.props.credentialVersion ?? '', await hash(env.MCP_ACCESS_TOKEN)))) return text('Reconecte o plugin: a chave do proprietário foi alterada.', 401);
      return mcpHandler.fetch(request, env);
    },
  },
  defaultHandler: {
    async fetch(request, env) {
      const path = new URL(request.url).pathname;
      if (path === '/authorize') return authorize(request, env);
      if (path === '/health') return Response.json({ status: 'ok', readOnly: true, authentication: 'oauth' });
      return text('Wanderlog privado. Inicie a conexão pelo plugin Wanderlog · Cloudflare.', 404);
    },
  },
  authorizeEndpoint: '/authorize', tokenEndpoint: '/token', clientRegistrationEndpoint: '/register',
  scopesSupported: [READ_SCOPE, 'offline_access'], requiredScopes: [READ_SCOPE],
  resourceMetadata: { resource: RESOURCE, authorization_servers: [ORIGIN], resource_name: 'Wanderlog privado' },
  accessTokenTTL: 3600, refreshTokenTTL: 30 * 86400, refreshTokenIdleTTL: 30 * 86400,
  clientRegistrationTTL: undefined,
  clientRegistrationCallback({ clientMetadata }) {
    if (!Array.isArray(clientMetadata.redirect_uris) || !clientMetadata.redirect_uris.length || !clientMetadata.redirect_uris.every(allowedRedirect)) return { description: 'Only ChatGPT cloud redirect URIs are allowed.' };
  },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return text('Host inválido.', 400);
    if (['/authorize', '/register', '/token'].includes(url.pathname) && request.method === 'POST' && url.pathname !== '/authorize') {
      if (!env.AUTH_LIMITER || !(await env.AUTH_LIMITER.limit({ key: `protocol:${request.headers.get('cf-connecting-ip') ?? 'unknown'}` })).success) return text('Aguarde um minuto.', 429);
      if (Number(request.headers.get('content-length') ?? '0') > 16384) return text('Requisição muito grande.', 413);
    }
    try { return await provider.fetch(request, env, ctx); }
    catch { return text('Serviço temporariamente indisponível.', 503); }
  },
};
