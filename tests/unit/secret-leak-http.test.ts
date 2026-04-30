import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../src/redact.ts";

/**
 * Item #08 — secret-leak canary, HTTP transport.
 *
 * `src/http.ts` is the HTTP entry point. Booting it in a unit test would
 * spin up an Express server, so instead we lean on the contract:
 *
 *   1. Every `console.error(...)` call in `src/http.ts` must route at
 *      least one of its arguments through `redactSecrets()`.
 *   2. `redactSecrets()` itself strips the cookie / token (proven by
 *      `tests/unit/redact-secrets.test.ts`).
 *
 * Together those two guards mean a sentinel cookie cannot reach stdout
 * via `console.error`. This test enforces (1) by parsing `src/http.ts`
 * source, and adds a sentinel-string sanity check on `redactSecrets`
 * for completeness.
 *
 * Pairs with `tests/unit/secret-leak.test.ts` (REST canary) and
 * `tests/unit/secret-leak-ws.test.ts` (WS canary). Together they cover
 * all three transports that touch the cookie.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const httpSource = readFileSync(resolve(repoRoot, "src/http.ts"), "utf8");

const SENTINEL = "s%3ASENTINEL-HTTP-COOKIE.signaturepart";

describe("secret-leak canary — HTTP transport routes log lines through redactSecrets (item #08)", () => {
  it("imports redactSecrets from the helper module", () => {
    expect(httpSource).toMatch(/from "\.\/redact\.js"/);
    expect(httpSource).toMatch(/import \{ redactSecrets \}/);
  });

  it("every console.error call in src/http.ts mentions redactSecrets in its arguments", () => {
    // Match a console.error( ... ) call up to the matching closing paren on
    // the same call expression. Forgiving on whitespace/newlines.
    const callRegex = /console\.error\s*\(([\s\S]*?)\)\s*;/g;
    const calls = [...httpSource.matchAll(callRegex)].map((m) => m[1]!);
    expect(calls.length).toBeGreaterThan(0);
    for (const callArgs of calls) {
      expect(
        callArgs.includes("redactSecrets"),
        `console.error call without redactSecrets:\nconsole.error(${callArgs})`,
      ).toBe(true);
    }
  });

  it("redactSecrets strips a sentinel cookie from a request-like line", () => {
    const line = `GET /mcp?token=${SENTINEL} HTTP/1.1 cookie=connect.sid=${SENTINEL}`;
    const out = redactSecrets(line);
    expect(out).not.toContain(SENTINEL);
    expect(out).not.toContain("SENTINEL-HTTP-COOKIE");
  });

  it("redactSecrets strips a sentinel cookie from a multi-line stack trace", () => {
    const stack = [
      "Error: kaboom",
      `    at handler (/app/dist/http.js:1:1) // url=/mcp?token=${SENTINEL}`,
      `    at handler (/app/dist/http.js:2:1) // cookie=connect.sid=${SENTINEL}`,
    ].join("\n");
    expect(redactSecrets(stack)).not.toContain(SENTINEL);
  });
});
