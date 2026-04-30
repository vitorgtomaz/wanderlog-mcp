# 03 — Audit HTTP error logging for cookie leakage

**Severity:** High
**Category:** Data leak
**Status:** Todo

## Problem

The HTTP transport logs at three sites:

- `src/http.ts:130` — `console.error("[wanderdog] auth failed: ${msg}")`
- `src/http.ts:148` — `console.error("[wanderdog] error handling request:", error)`
- `src/http.ts:191` — `console.error("[wanderdog] fatal: …")` with `error.stack`

Today no error path embeds the cookie in `.message` / `.stack`. But:

- If `?token=COOKIE` is in `req.url` (see #01), any thrown error that
  captures the URL into its message or stack will leak the cookie into
  fly.io stdout logs.
- A future Express middleware error (e.g. body parse) will likely include
  `req.url`.

The `secret-leak.test.ts` canary covers `RestClient` only — there's no
guard on the HTTP path.

## Affected files

- `src/http.ts:130, 148, 191` — error log sites.
- (Indirectly) `tests/unit/secret-leak.test.ts` — canary to extend (see #08).

## Fix steps

1. Add a small `redactUrl(url: string): string` helper near the top of
   `src/http.ts` that strips the `token` query param from a URL string.
   Apply it to any URL or `req.url` before it is included in a log line.
2. Replace `console.error("[wanderdog] error handling request:", error)`
   with `console.error("[wanderdog] error handling request:", (error as Error).message)`.
   Never log the raw `error` object, since `error.stack` may capture
   surrounding context including `req.url`.
3. For the `fatal` log site, strip cookies from `error.stack` defensively
   by running it through a `connect.sid=…[^;\s]+` regex replacement, or
   simply log `error.message` and a short stack-top frame.
4. **Write/extend unit test** — extend `tests/unit/secret-leak.test.ts` (or
   a new HTTP-specific suite — see #08) to:
   - Spawn `handleMcp` with a sentinel cookie in `Authorization` and a
     forced upstream error (mock `RestClient.getUser` to throw).
   - Capture `console.error` via `vi.spyOn(console, "error")`.
   - Assert no captured argument contains the sentinel cookie.
   - Repeat with the cookie in `?token=…` (this case should be 401 after
     #01, but the test should still confirm no cookie reaches the logs).
5. Run `npm run build && npm run test` and `npm run test:integration`.

## Verification

- The new test fails if `console.error` ever receives the sentinel cookie.
- Manual: start `dist/http.js`, hit `/mcp?token=SENTINEL` with a malformed
  body, tail logs, confirm no `SENTINEL` appears.

## References

- Audit finding #3.
- Builds on #01 (drop `?token=`) — once that lands, the URL-based leak path
  is gone and this fix mostly hardens against future regressions.
- Builds on #08 (extend secret-leak canary) — share the harness.
