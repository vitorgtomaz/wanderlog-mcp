import { describe, expect, it } from "vitest";
import { extractCookie } from "../../src/http-auth.ts";

/**
 * Regression test for security hardening item #01: the HTTP transport must
 * not accept the `connect.sid` cookie via a `?token=` query parameter.
 *
 * URLs end up in reverse-proxy access logs, browser history, and `Referer`
 * headers, and the cookie is a long-lived credential. See CLAUDE.md
 * invariant #5 and docs/security-hardening/01-drop-token-query-param.md.
 *
 * If `extractCookie` ever starts reading from `req.url` again, the SENTINEL
 * tests below will fail.
 */

const SENTINEL = "s%3ASENTINEL-COOKIE-VALUE-DO-NOT-LEAK.signaturepart";

function makeReq(headers: Record<string, string | undefined>) {
  return { headers };
}

describe("extractCookie — Authorization header is the only accepted source", () => {
  it("returns the cookie when Authorization: Bearer <cookie> is set", () => {
    expect(
      extractCookie(makeReq({ authorization: `Bearer ${SENTINEL}` })),
    ).toBe(SENTINEL);
  });

  it("returns the cookie regardless of Bearer scheme casing", () => {
    expect(
      extractCookie(makeReq({ authorization: `bearer ${SENTINEL}` })),
    ).toBe(SENTINEL);
    expect(
      extractCookie(makeReq({ authorization: `BEARER ${SENTINEL}` })),
    ).toBe(SENTINEL);
  });

  it("returns null when no Authorization header is present", () => {
    expect(extractCookie(makeReq({}))).toBeNull();
  });

  it("returns null for non-Bearer schemes (Basic, Digest, …)", () => {
    expect(
      extractCookie(makeReq({ authorization: `Basic ${SENTINEL}` })),
    ).toBeNull();
    expect(
      extractCookie(makeReq({ authorization: `Digest token=${SENTINEL}` })),
    ).toBeNull();
  });

  it("returns null for an empty Bearer value", () => {
    expect(extractCookie(makeReq({ authorization: "Bearer " }))).toBeNull();
    expect(extractCookie(makeReq({ authorization: "Bearer    " }))).toBeNull();
  });
});

describe("extractCookie — query-param fallback must stay removed (item #01)", () => {
  it("ignores ?token=<cookie> on the request URL", () => {
    // The request shape used to include `url`. We simulate an attacker (or
    // confused client) attaching the cookie to the URL alongside no
    // Authorization header. The function must not extract anything.
    const reqWithUrl = {
      headers: {} as Record<string, string | undefined>,
      url: `/mcp?token=${SENTINEL}`,
    };
    expect(extractCookie(reqWithUrl)).toBeNull();
  });

  it("ignores ?token even when Authorization is present (Authorization wins)", () => {
    const reqWithBoth = {
      headers: { authorization: "Bearer header-value" },
      url: `/mcp?token=${SENTINEL}`,
    };
    // The header value is what comes back; the URL token is never read.
    expect(extractCookie(reqWithBoth)).toBe("header-value");
  });

  it("does not echo the SENTINEL cookie when reading the URL is attempted", () => {
    // Defense-in-depth: capture console output around the call and assert
    // the sentinel never surfaces. extractCookie shouldn't log at all, but
    // this guards against accidental console.log additions.
    const captured: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    const origWarn = console.warn;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    console.warn = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    try {
      extractCookie({
        headers: {},
        url: `/mcp?token=${SENTINEL}`,
      } as unknown as { headers: Record<string, string | undefined> });
    } finally {
      console.log = origLog;
      console.error = origErr;
      console.warn = origWarn;
    }
    for (const line of captured) {
      expect(line).not.toContain("SENTINEL");
      expect(line).not.toContain("signaturepart");
    }
  });
});
