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

## Item #04 — Bumped concise `get_trip` token budget 2000 → 2500

- **Decision:** Raised the concise `get_trip` budget in
  `tests/unit/token-budgets.test.ts` to absorb the fixed cost of
  `<untrusted>…</untrusted>` wraps (~23 chars × ~140 wraps on a 134-place
  trip ≈ 800 extra tokens).
- **Why:** The wraps are deliberate, security-driven, and one-time. Without
  the bump the new test would fail; without the budget at all the test
  loses its regression-fence value. 2500 keeps the fence (catches >2x
  bloat) without watering it down to nothing.
- **How to revisit:** `tests/unit/token-budgets.test.ts:18` (`getTripConcise`).
  Detailed/small budgets unchanged — they had room.

## Item #04 — Wrapped contributor usernames and traveler names too

- **Decision:** The spec listed title / day-heading / place name / inline
  note / hotel-confirmation. I also wrapped contributor usernames (in
  the detailed trip header) and flight `travelerNames` because they are
  attacker-controlled in the same friends-shared-trip channel.
- **Why:** Same threat model. Skipping them would leave a hole.
- **How to revisit:** `src/formatters/trip-summary.ts` `formatTripHeader`,
  `formatFlightBlock`. If you want a tighter scope, drop those two wraps.

## Item #04 — Did not wrap server-derived fields

- **Decision:** Left `formatted_address`, `international_phone_number`,
  `types`, ratings, dates, IATA codes, place IDs, and section *default*
  headings (when the user didn't set one) unwrapped.
- **Why:** Spec calls for this explicitly: "Do not wrap dates, IDs, ratings,
  or other server-derived fields — keep the noise minimal." These come
  from Google Places / Wanderlog server, not free-text user input.
- **How to revisit:** `src/formatters/trip-summary.ts` `formatPlaceBlock`
  (the parts after `parts.push(\`${time}…\`)`).

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
