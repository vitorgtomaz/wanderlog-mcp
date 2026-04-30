# 06 — Tell LLM not to volunteer PII unprompted

**Severity:** Medium
**Category:** Data leak
**Status:** Todo

## Problem

`formatTrip` in `src/formatters/trip-summary.ts` exposes, in `detailed`
format:

- International phone numbers (`p.international_phone_number`, line 198).
- Hotel confirmation numbers (`block.hotel.confirmationNumber`, line 202).
- Flight confirmation numbers and traveler names (`formatFlightBlock`,
  lines 266-267).
- Train confirmation numbers (`formatTrainBlock`, line 286).

For a self-hosted model this is fine — that's the user's data flowing
back through their own pipeline. For a hosted LLM provider, the user may
not realise they're sending phone numbers and confirmation numbers to a
third party every time they ask "what's on day 3?". Even where the
transmission itself is acceptable, the model has no instruction to keep
these fields out of its visible reply unless the user asked.

## Affected files

- `src/server.ts:94-122` — `SERVER_INSTRUCTIONS`.

## Fix steps

1. Append a paragraph to `SERVER_INSTRUCTIONS`:

   > Confirmation numbers, phone numbers, and traveler names returned by
   > these tools are sensitive and should not appear in your reply unless
   > the user explicitly asked for them. Use them to answer questions
   > about the trip, then summarise without quoting them back.

2. Keep #02's untrusted-content paragraph and this PII paragraph as two
   distinct paragraphs so each can be amended independently.
3. **Write/extend unit test** — extend the `server-instructions.test.ts`
   added in #02 (or add a new case there) that asserts:
   - The phrase "Confirmation numbers" appears in `SERVER_INSTRUCTIONS`.
   - The phrase "should not appear in your reply unless" (or similar
     stable substring) appears in `SERVER_INSTRUCTIONS`.
4. Run `npm run build && npm run test` — confirm green.

## Verification

- The new assertions fail if the paragraph is removed.
- Manual: ask the LLM "what's the next trip on my calendar?" against a
  trip with a hotel confirmation number — the reply should not include
  the confirmation number.

## References

- Audit finding #5 (renumbered to #6 by priority in this workplan).
- Implements alongside #02 — same file, same test target. Can be one
  commit (`security(02-06): SERVER_INSTRUCTIONS hardening`) or two.
