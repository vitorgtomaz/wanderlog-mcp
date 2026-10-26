# Wanderlog cloud OAuth

Independent read-only Worker and private plugin; no Sites or local MCP setup required.

MCP: https://wanderlog-consulta-privada.vitorgtomaz.workers.dev/mcp
Plugin: https://chatgpt.com/plugins/plugins_6adf64cf69d48191ae60bf9902aa1629

## Connect

Update the private Wanderlog · Cloudflare plugin to 1.1.0, select Connect and enter your existing MCP_ACCESS_TOKEN on the Worker consent page. Select Autorizar consulta. Do not enter the Wanderlog cookie on this page. OAuth access and refresh tokens keep the connection in the cloud.

## Server configuration

The deployment preserves the WANDERLOG_COOKIE and MCP_ACCESS_TOKEN secrets. OAUTH_KV stores the official Cloudflare OAuth provider's grant state; AUTH_LIMITER limits login attempts. The provider handles discovery, DCR, PKCE S256, code consumption, refresh rotation and revocation. Consent transactions are browser-bound and expire after ten minutes. Only documented ChatGPT cloud redirect paths are accepted. Rotating MCP_ACCESS_TOKEN invalidates existing grants at the MCP handler.

The entrypoint is oauth.mjs, wrapping the shared MCP handler. The legacy API-key adapter in worker.mjs is retained for core tests but is not deployed. The owner's key is not accepted as an MCP bearer token in the OAuth deployment.

The three tools check connection status, list trips and read trip snapshots. All upstream operations are GET requests to a fixed Wanderlog origin; snapshots omit view registration and have a 4 MiB payload limit. This is a read-only port, not the upstream server's full tool set.

## Build and test

From cloudflare/, run npm install then npm test. Keep secrets out of source and preserve their bindings on deployment.

Validation: all six tests passed, including the actual OAuth library and bundled handler with an in-memory KV adapter. Tests cover discovery, redirect rejection, browser-bound consent, wrong passwords, origin checks, PKCE, code replay and grant revocation, refresh, and protected MCP calls. Local workerd verification was unavailable due to environment failures. Production OAuth discovery was verified in a browser. Owner consent and live Wanderlog access are pending.

The older Sites plugin remains unchanged.
