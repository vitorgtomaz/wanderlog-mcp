# 05 — Default `wanderlog_get_trip_url` to `view` mode

**Severity:** Medium
**Category:** Data leak
**Status:** Todo

## Problem

`wanderlog_get_trip_url` defaults to `mode: "edit"`, returning a URL of the
form `https://wanderlog.com/plan/{editKey}`. That URL is a bearer token —
anyone who has it gets full edit permissions on the trip.

The LLM happily includes URLs in chat. If the user later screenshots,
copies, or pastes the chat (or shares it via support, social, etc.), the
edit URL leaks. The view URL (`viewKey`) is read-only and explicitly safe
to share — the tool's own description even says so. The default is wrong.

## Affected files

- `src/tools/get-trip-url.ts:14-15` — `mode` zod default.
- `src/tools/get-trip-url.ts:35-39` — `pickKey` logic (no change needed,
  but verify).
- `src/tools/get-trip-url.ts:55` — `args.mode ?? "edit"` runtime default.
- `src/tools/get-trip-url.ts:19-28` — `getTripUrlDescription` text.

## Fix steps

1. Change the zod default from `.default("edit")` to `.default("view")`.
2. Change `const mode = args.mode ?? "edit"` to `args.mode ?? "view"`.
3. Update `getTripUrlDescription` to:
   - State that `view` is the safe default and is read-only.
   - Tell the LLM to pass `mode: "edit"` only when the user explicitly
     asks for an editable link, and to warn the user that an edit URL
     grants write access to anyone who has it.
4. Update the `suffix` in `getTripUrl` so the response wording for `view`
   leads with "Read-only link — safe to share." (already present) and the
   `edit` response includes a brief warning ("anyone with this URL can
   edit the trip — keep it private").
5. **Write/extend unit test** — extend `tests/unit/get-trip-url.test.ts`:
   - Assert that calling `getTripUrl` with no `mode` argument returns the
     view URL (uses `viewKey` if present, falls back per `pickKey`).
   - Assert the response text for the default case contains "Read-only".
   - Assert the response text for `mode: "edit"` contains the
     anyone-with-this-URL warning.
   - Keep all existing test cases green.
6. Run `npm run build && npm run test` — confirm green.

## Verification

- The new test fails if the default is restored to `edit`.
- Manual: from an MCP host, call `wanderlog_get_trip_url(trip_key)` and
  confirm the returned URL has the `viewKey` path component.

## References

- Audit finding #4.
- Tool design principle: dangerous defaults should require an opt-in.
