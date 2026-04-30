import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../src/redact.ts";

/**
 * Regression test for security hardening item #03: any string that we hand to
 * `console.error` from the HTTP entrypoint must be passed through
 * `redactSecrets` first, so a leaking `?token=…` URL or a stray
 * `connect.sid=…` substring does not surface in fly.io stdout.
 *
 * If this test fails, either the redaction regex was loosened or someone
 * added a fresh log site that bypasses the helper. Find it and stop it.
 * See docs/security-hardening/03-http-error-logging-audit.md.
 */

const SENTINEL = "s%3ASENTINEL-COOKIE-VALUE.signaturepart";

describe("redactSecrets — strips credentials from log strings", () => {
  it("redacts ?token= query params", () => {
    const out = redactSecrets(`GET /mcp?token=${SENTINEL} HTTP/1.1`);
    expect(out).not.toContain(SENTINEL);
    expect(out).toContain("token=REDACTED");
  });

  it("redacts &token= query params (mid-string)", () => {
    const out = redactSecrets(`/mcp?foo=bar&token=${SENTINEL}&baz=qux`);
    expect(out).not.toContain(SENTINEL);
    expect(out).toContain("token=REDACTED");
    expect(out).toContain("foo=bar");
    expect(out).toContain("baz=qux");
  });

  it("redacts connect.sid=… substrings", () => {
    const out = redactSecrets(`Cookie: connect.sid=${SENTINEL}; other=1`);
    expect(out).not.toContain(SENTINEL);
    expect(out).toContain("connect.sid=REDACTED");
    expect(out).toContain("other=1");
  });

  it("redacts cookie inside a multi-line stack-trace-shaped string", () => {
    const stack = [
      "Error: kaboom",
      `    at handler (/app/dist/http.js:1:1) // url=/mcp?token=${SENTINEL}`,
      `    at processTicksAndRejections (cookie connect.sid=${SENTINEL})`,
    ].join("\n");
    const out = redactSecrets(stack);
    expect(out).not.toContain(SENTINEL);
    expect(out).not.toContain("SENTINEL-COOKIE-VALUE");
    expect(out).toContain("token=REDACTED");
    expect(out).toContain("connect.sid=REDACTED");
  });

  it("is a no-op for strings that contain no secrets", () => {
    const out = redactSecrets("regular log line, no secrets here");
    expect(out).toBe("regular log line, no secrets here");
  });

  it("redacts multiple occurrences in a single string", () => {
    const out = redactSecrets(
      `connect.sid=${SENTINEL} ... connect.sid=${SENTINEL}`,
    );
    expect(out).not.toContain(SENTINEL);
    expect(out.match(/REDACTED/g)?.length).toBe(2);
  });
});
