# Wanderlog read-only Cloudflare deployment

Independent Worker and private plugin, without Sites hosting.

Endpoint: https://wanderlog-consulta-privada.vitorgtomaz.workers.dev/mcp

## Configure secrets

Open Cloudflare → Workers & Pages → `wanderlog-consulta-privada` → Settings → Variables and Secrets. Add both values with type **Secret**, then deploy:

- `WANDERLOG_COOKIE`: log into https://wanderlog.com, open browser DevTools → Application → Cookies → https://wanderlog.com, and copy the `connect.sid` value. Paste only this value, without surrounding quotes. This session grants access to the Wanderlog account; never commit it.
- `MCP_ACCESS_TOKEN`: generate a random password of at least 32 characters with a password manager. Keep this separate from the Wanderlog session cookie.

Install/connect the private `Wanderlog · Cloudflare` plugin and enter the **same `MCP_ACCESS_TOKEN` value** as its API key. Do not enter the Wanderlog cookie in the plugin. The plugin uses Bearer authentication.

Private plugin: https://chatgpt.com/plugins/plugins_6adf64cf69d48191ae60bf9902aa1629

The plugin package is in `plugins/wanderlog-cloudflare/`. It contains no credentials.

## Behavior

- `wanderlog_connection_status`: validates the session with `/api/user`.
- `wanderlog_list_trips`: validates the session and reads `/api/tripPlans/home`.
- `wanderlog_get_trip_snapshot`: reads the selected trip, without registering a view.
- Only upstream GET requests to the fixed `https://wanderlog.com` origin are possible.
- All MCP requests require `MCP_ACCESS_TOKEN`. Missing configuration fails closed.
- Credentials and upstream exception text are not returned in tool errors.
- The public `/health` endpoint reports process health only; it does not validate the session.
- Snapshot responses are limited to 4 MiB. This is a deliberately small read-only port, not the original server's full tool set.

Run tests: `node --test cloudflare/worker.test.mjs`.

On 2026-10-26, the Worker was uploaded through the authenticated Cloudflare connector and `/health` was verified in a browser. The two runtime secrets and the plugin connection still require the owner's input. Live Wanderlog access has not been verified.

The older Sites plugin remains unchanged.
