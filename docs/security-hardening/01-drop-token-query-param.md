# 01 — Drop `?token=` query-param fallback

**Severity:** High
**Category:** Data leak
**Status:** Done ✅

## Problem

The HTTP transport accepts the `connect.sid` cookie either via
`Authorization: Bearer …` (good) or via a `?token=…` query parameter (bad).
Anything that travels in a URL ends up in:

- Fly.io / reverse-proxy access logs (URLs are logged; headers usually aren't).
- Browser history and `Referer` headers if a browser ever hits the endpoint.
- Any process or library that incidentally prints `req.url`.

This directly contradicts CLAUDE.md invariant #5 ("Cookie value must never
appear in tool responses, logs, or error messages") in the HTTP deployment.

## Affected files

- `src/http.ts:90-94` — `extractCookie` `?token=` branch.
- `src/http.ts:107-120` — auth failure response (the 401 message should be re-checked too).

## Fix steps

1. Remove the `?token=` branch from `extractCookie` in `src/http.ts`. Keep
   only the `Authorization: Bearer` path.
2. Update the 401 error message to mention only the `Authorization` header,
   so callers don't try the query-param path and silently fail.
3. **Write/extend unit test** — add a new test file
   `tests/unit/http-auth.test.ts` (or extend an existing HTTP-transport test
   if one is created in #08) that:
   - Asserts a request with `?token=…` and no `Authorization` header returns
     401.
   - Asserts the response body and any `console.error` capture do not
     contain the sentinel cookie value passed in the URL.
   - Asserts a request with a valid `Authorization: Bearer` header passes the
     auth gate (mock `RestClient.getUser`).
4. Run `npm run build && npm run test` — confirm green.
5. Run `npm run test:integration` (touches `src/http.ts`).

## Verification

- `grep -n 'searchParams.get("token")' src/http.ts` returns nothing.
- A `curl` against the HTTP endpoint with `?token=…` returns 401.
- The new unit test fails if the `?token=` branch is restored.

## References

- Audit finding #1.
- CLAUDE.md invariant #5 (cookie never in tool responses, logs, or errors).
- Pairs with #03 (HTTP error-logging audit) — once `?token=` is gone, the
  `console.error(error)` leak surface in `src/http.ts:148` shrinks dramatically.
