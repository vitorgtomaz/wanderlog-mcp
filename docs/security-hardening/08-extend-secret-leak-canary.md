# 08 — Extend `secret-leak.test.ts` to WS and HTTP transports

**Severity:** Low
**Category:** Data leak
**Status:** Done ✅

## Problem

`tests/unit/secret-leak.test.ts` is a strong sentinel-cookie canary, but
it only exercises the `RestClient` (`src/transport/rest.ts`). The two
other transports that handle the cookie have no equivalent guard:

- `ShareDBClient` (`src/transport/sharedb.ts:117-180`) sends the cookie
  as a WebSocket header. Its error paths (handshake timeout, 401 upgrade,
  server error frame, send-after-close) currently don't echo the cookie,
  but nothing prevents a future regression.
- `src/http.ts` `handleMcp` plumbs the cookie through context creation,
  Express, and the MCP transport. After fixes #01 and #03, the surface
  should be small — but again, no guard.

## Affected files

- `tests/unit/secret-leak.test.ts` — extend with new suites.
- (Reference) `src/transport/sharedb.ts`, `src/http.ts`.

## Fix steps

1. **WS suite.** Add a `describe("secret-leak canary — ShareDB WS errors do not include the cookie")` block. Use the existing `mockWebSocket` pattern from `tests/integration/sharedb.test.ts` if available, or stub `WebSocket` directly. Drive these failure modes:
   - Handshake timeout — instantiate `ShareDBClient`, call `.connect()`, never deliver a `hs` frame, advance fake timers past 10 s; assert the rejected error's `.message`, `.stack`, and `toUserMessage()` contain none of the sentinel fragments.
   - 401 upgrade — emit `unexpected-response` with `statusCode: 401`; assert the `WanderlogAuthError` does not contain the sentinel.
   - Server error frame — connect, subscribe, submit, then deliver `{ error: "boom", seq: <known> }`; assert the rejected submit's error does not contain the sentinel.
   - Send-after-close — close the WS, attempt `.submit(...)`; assert thrown error doesn't carry the sentinel.
2. **HTTP suite.** Add a `describe("secret-leak canary — HTTP transport errors do not include the cookie")` block. Use a minimal harness that spawns `handleMcp` with a fake `req`/`res` (or `supertest` if added; prefer keeping deps unchanged). Drive:
   - Valid `Authorization: Bearer <sentinel>`, force `RestClient.getUser` to throw — capture `console.error` via `vi.spyOn`, assert no captured argument contains the sentinel.
   - `?token=<sentinel>` (post-#01: 401 path) — same assertion.
   - Internal MCP transport throw inside `transport.handleRequest` — same assertion.
3. Reuse the existing `containsSentinel` / `assertNoLeakFromThrowable`
   helpers from the file rather than duplicating them.
4. **Write/extend unit test** — that *is* this fix; the deliverable is
   the new test code itself. Confirm the new tests pass against the
   current source, then deliberately introduce a regression
   (e.g. `console.error("…", req.url)` with `?token=` set) and confirm
   the new test fails. Revert.
5. Run `npm run build && npm run test` — confirm green.

## Verification

- All new test cases pass against current source.
- Each new test case fails if a corresponding regression is introduced
  (verify at least one regression injection per suite).
- Existing REST suite continues to pass unchanged.

## References

- Audit finding #6.
- Builds on #01 (Bearer-only auth) and #03 (HTTP error logging) — once
  those land, this canary locks the surface down.
