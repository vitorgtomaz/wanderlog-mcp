# Security Hardening To Dos

Workplan tracking the findings from the prompt-injection / private-data
security audit run on `claude/security-audit-DolNJ`. Each item links to its
own file with concrete fix steps, a mandatory unit-test step, and
verification notes.

Items are ordered by priority: High severity first, then Medium, then Low.
Within each tier the order reflects "smallest, highest-leverage change first"
so early fixes also reduce the surface for later ones (e.g. dropping
`?token=` makes the HTTP error-logging audit trivial).

## Checklist

### High

- [x] [01 — Drop `?token=` query-param fallback](./01-drop-token-query-param.md) — Data leak
- [x] [02 — Warn LLM about untrusted trip content](./02-untrusted-content-warning.md) — Prompt injection
- [ ] [03 — Audit HTTP error logging for cookie leakage](./03-http-error-logging-audit.md) — Data leak
- [ ] [04 — Wrap third-party trip fields in untrusted-data delimiters](./04-untrusted-data-delimiters.md) — Prompt injection

### Medium

- [ ] [05 — Default `wanderlog_get_trip_url` to `view` mode](./05-trip-url-default-view.md) — Data leak
- [ ] [06 — Tell LLM not to volunteer PII unprompted](./06-pii-volunteering-instruction.md) — Data leak
- [ ] [07 — Update README "Security" section for HTTP relay model](./07-readme-http-relay-security.md) — Data leak

### Low

- [ ] [08 — Extend `secret-leak.test.ts` to WS and HTTP transports](./08-extend-secret-leak-canary.md) — Data leak
- [ ] [09 — Quote echoed user input consistently in tool responses](./09-quote-echoed-input.md) — Prompt injection
- [ ] [10 — Drop raw `place_id` from `wanderlog_search_places` detailed format](./10-drop-raw-place-id.md) — Prompt injection

## Conventions

- **Severity:** High = exploitable in the current deployment. Medium = exploitable under realistic but narrower conditions. Low = defense-in-depth or hygiene.
- **Status markers:** flip `[ ]` → `[x]` here when the corresponding per-fix file's `Status:` is set to `Done` and the change has landed on `main`.
- **One commit per fix.** Each commit message should reference the fix number, e.g. `security(01): drop ?token= query-param fallback`.
- **Tests are mandatory.** Every per-fix file lists a unit-test step. No fix is `Done` until its test exists and passes (`npm run build && npm run test`).

## References

- `CLAUDE.md` — architectural invariants. Several fixes restore specific invariants (#2 raw-ID exposure, #5 cookie-never-in-output).
- `tests/unit/secret-leak.test.ts` — existing canary; #03 and #08 build on it.
- `tests/unit/prompt-injection.test.ts` — existing canary; #02, #04, and #09 build on it.
