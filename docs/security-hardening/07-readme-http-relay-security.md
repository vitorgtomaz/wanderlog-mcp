# 07 — Update README "Security" section for HTTP relay model

**Severity:** Medium
**Category:** Data leak
**Status:** Done ✅

## Problem

`README.md:233-238` claims:

> - wanderlog-mcp runs entirely on your machine — there's no relay server

That's true for the stdio entrypoint (`dist/index.js`), but `dist/http.js`
+ `fly.toml` ship a multi-tenant HTTP server that:

- Accepts cookies from any caller via `Authorization: Bearer …`.
- Holds plaintext cookies in process memory keyed by SHA-256(cookie) for up
  to 10 minutes (`CTX_TTL_MS = 10 * 60 * 1000`, `src/http.ts:13-36`).
- Logs request errors to stdout (where fly.io captures them).

A user reading the current README assumes "no relay" and may not realise
the HTTP deployment changes the trust model. The documentation should
clearly distinguish the two modes and spell out the operator-trust
assumption for the HTTP path.

## Affected files

- `README.md:233-238` — Security section.
- (Reference) `src/http.ts:13-36`, `fly.toml`.

## Fix steps

1. Replace the current Security section with two subsections:

   ### Security — local stdio mode

   - Cookie lives only in your MCP client config and the local Node
     process. No relay, no network egress beyond wanderlog.com itself.
     (Existing bullets, unchanged.)

   ### Security — HTTP transport (`dist/http.js`, fly.io)

   - The HTTP server is a multi-tenant relay. Every request must include
     `Authorization: Bearer <connect.sid>` (header only — see commit `01`).
   - Cookies are held in process memory for up to 10 minutes after last
     use, hashed for cache lookup but stored in plaintext for outbound
     calls to wanderlog.com.
   - Operators are trusted with every active user's cookie. Deploy only
     behind TLS, restrict ingress, and rotate any cookies you suspect
     were exposed.
   - The server is stateless across restarts; restarting evicts all
     cached cookies.

2. Cross-link to `docs/security-hardening/` if those docs are eventually
   shipped (currently gitignored).
3. **Write unit test** — add `tests/unit/readme.test.ts` (small) that:
   - Reads `README.md` from disk.
   - Asserts the file contains both "Security — local stdio mode" and
     "Security — HTTP transport" subsection headings.
   - Asserts the existing false claim "there's no relay server" no longer
     appears.
4. Run `npm run build && npm run test` — confirm green.

## Verification

- The new test fails if either subsection is removed or the false claim
  is reintroduced.
- Manual: render the README and confirm both subsections render correctly
  in GitHub's Markdown view.

## References

- Audit finding #5 (renumbered to #7 in this workplan by priority).
- Pairs with #01 (Bearer-only auth, which the README will now correctly
  state as a hard requirement).
