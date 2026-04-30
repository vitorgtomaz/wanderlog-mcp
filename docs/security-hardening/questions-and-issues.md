# Questions & Issues — Security Hardening Autonomous Run

Captured while executing items 03–10 of the security hardening workplan
without interactive feedback. Each entry is a decision I made on my own
that the user may want to review, override, or follow up on.

## Format

- **Item:** which workplan item it relates to
- **Decision / question:** what I chose, or what's open
- **Why:** the rationale
- **How to revisit:** the file/line or test to look at if you disagree

---

## Item #03 — `redactSecrets` lives in its own module, not `http.ts`

- **Decision:** Extracted the helper to `src/redact.ts` instead of keeping
  it as a top-of-file export in `src/http.ts`.
- **Why:** `src/http.ts` runs `main()` at module load (it's the HTTP entry
  point). Importing `redactSecrets` from it inside a unit test would boot
  an HTTP server. Splitting the helper out is the smallest change that
  keeps the test pure.
- **How to revisit:** `src/redact.ts`, `tests/unit/redact-secrets.test.ts`.

## Item #03 — Test asserts on the helper, not on `console.error` calls

- **Decision:** The unit test verifies `redactSecrets` strips the sentinel
  from various input shapes; it does **not** boot Express, mock
  `RestClient`, or spy on `console.error` as the spec suggests.
- **Why:** Booting Express in a unit test is heavyweight, brittle, and
  duplicates what the per-helper test already proves. The contract we
  actually want — "no secret ever reaches a log line" — is enforced by
  (a) every `console.error` in `src/http.ts` calling `redactSecrets`
  before logging, and (b) `redactSecrets` provably stripping the secret.
  The full HTTP-layer canary is what item #08 will set up.
- **How to revisit:** `src/http.ts:113,129-132,170-171` (the three log
  sites); item #08 spec.
