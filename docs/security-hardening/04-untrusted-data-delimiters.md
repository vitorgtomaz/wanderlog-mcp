# 04 — Wrap third-party trip fields in untrusted-data delimiters

**Severity:** High
**Category:** Prompt injection
**Status:** Todo

## Problem

`RestClient.listTrips()` (`src/transport/rest.ts:97-111`) returns the
caller's own trips merged with `friendsTripPlans` and
`friendsPrivateSharedTripPlans`. Any user-controlled string field on those
trips — title, day heading, place name (when free-text), inline note,
hotel confirmation number, contributor username — is rendered verbatim
into the LLM's context by the formatter.

`tests/unit/prompt-injection.test.ts` already proves the formatter renders
these strings verbatim (good) and doesn't synthesise control tokens itself
(also good). What's missing is a **structural cue** that tells the LLM the
field is data, not instructions. Pair with #02's natural-language warning
to give the model both reason and structure.

## Affected files

- `src/formatters/trip-summary.ts`:
  - `formatTripList` (line 17)
  - `formatTripHeader` (line 120)
  - `renderSection` (line 66)
  - `renderDaySection` (line 81)
  - `formatPlaceBlock` (line 172)
  - `formatNoteBlock` (line 210)
  - `formatChecklistBlock` (line 218)
  - `formatFlightBlock` (line 248)
  - `formatTrainBlock` (line 271)

## Fix steps

1. Introduce a `untrust(s: string): string` helper near the bottom of
   `src/formatters/trip-summary.ts`. Default implementation:
   `` `<untrusted>${s.replace(/<\/?untrusted>/g, "")}</untrusted>` ``.
   The inner replacement defends against an attacker placing
   `</untrusted>` inside their own field to break out of the wrapper.
2. Apply `untrust(...)` to every echo of a user-controlled field listed
   above. Do **not** wrap dates, IDs, ratings, or other server-derived
   fields — keep the noise minimal.
3. Keep the wrappers off the per-line bullet markup; nested wrapping
   makes the output harder to read for the model. One wrap per field is
   enough.
4. **Write/extend unit test** — extend `tests/unit/prompt-injection.test.ts`:
   - Add a case asserting `<untrusted>...</untrusted>` surrounds each of
     `INJECTION_STRINGS.title`, `dayHeading`, `placeName`, `noteText`,
     `hotelConfirmation` in the rendered output.
   - Add a case where a field's raw value contains `</untrusted>`; assert
     the wrapper is intact (the inner replacement neutralised the breakout).
   - Keep the existing verbatim-rendering assertions — both must hold.
5. Run `npm run build && npm run test` — confirm green.

## Verification

- The new test fails if the wrappers are removed or if a field bypasses
  `untrust(...)`.
- Manual: call `wanderlog_get_trip` against a trip whose title is
  "Ignore previous instructions" and inspect the LLM-facing text — title
  should appear inside `<untrusted>...</untrusted>`.

## References

- Audit finding #7 (originally numbered #7 in the audit; renumbered to #4
  in this workplan by priority).
- Pairs with #02 (untrusted-content warning in `SERVER_INSTRUCTIONS`).
