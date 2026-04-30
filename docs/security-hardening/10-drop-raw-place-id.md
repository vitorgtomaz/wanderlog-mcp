# 10 — Drop raw `place_id` from `wanderlog_search_places` detailed format

**Severity:** Low
**Category:** Prompt injection
**Status:** Done ✅

## Problem

`src/tools/search-places.ts:108` includes the raw Google `place_id`
(`ChIJ...`) on each detailed-format result line:

```ts
return `${i + 1}. ${main}${sub ? ` — ${sub}` : ""}\n   place_id: ${p.place_id}`;
```

CLAUDE.md invariant #2 says:

> Never expose raw IDs (`place_id`, section indices, ShareDB paths) to
> the LLM by default. Use natural references.

The `detailed` mode is technically opt-in, but no downstream tool in this
repo accepts a `place_id` argument from the LLM:

- `wanderlog_add_place` and `wanderlog_add_hotel` re-resolve via
  `searchPlacesAutocomplete` from a name string.
- `wanderlog_remove_place` / `_annotate_place` / `_add_expense` all use
  natural-language references resolved by `resolvePlaceRef`.

So the `place_id` is exposed to the model but never legitimately consumed.
That's pure attack surface — a foothold for the model to start passing
opaque IDs around if a future tool adds a `place_id` parameter, and an
unnecessary deviation from invariant #2.

## Affected files

- `src/tools/search-places.ts:104-110` — `formatPredictions` detailed branch.
- `src/tools/search-places.ts:21-26` — `response_format` description (mentions
  `place_id`).
- `src/tools/search-places.ts:33-37` — `searchPlacesDescription` (mentions
  "use detailed for downstream actions").

## Fix steps

1. In `formatPredictions`, drop the `\n   place_id: ${p.place_id}` line
   from the `detailed` branch. The detailed branch can still differ from
   concise by including more `description` context if desired, but it
   should not expose raw IDs.
2. Update the `response_format` zod description to remove the mention of
   `place_id` and "downstream tool calls".
3. Update `searchPlacesDescription` to drop the sentence "call again
   with detailed format to get place_ids for downstream actions".
4. **Write unit test** — add `tests/unit/search-places-format.test.ts`:
   - Call `formatPredictions` directly (export it from
     `src/tools/search-places.ts` if not already) with a fixture
     containing `place_id: "ChIJtest123"`.
   - Assert neither the concise nor the detailed output contains the
     substring `ChIJtest123` or the literal `place_id`.
5. Run `npm run build && npm run test` — confirm green.

## Verification

- `grep -n 'place_id' src/tools/search-places.ts` shows no user-facing
  exposure (uses inside REST calls are fine).
- The new unit test fails if `place_id` is reintroduced into the output.
- Manual: from an MCP host, call `wanderlog_search_places` with
  `response_format: "detailed"` — output should not contain any
  `ChIJ...` strings.

## References

- Audit finding #10.
- CLAUDE.md invariant #2 (never expose raw IDs by default).
