import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Item #07 — README's Security section must distinguish the two transports.
 *
 * The local stdio entrypoint is process-local; the HTTP entrypoint is a
 * multi-tenant relay with very different trust assumptions. The README
 * used to claim "there's no relay server", which is wrong as soon as the
 * fly.io / dist/http.js path is in scope. This test fences the new
 * structure so a future docs refactor can't silently re-introduce the
 * misleading single-mode framing.
 *
 * See docs/security-hardening/07-readme-http-relay-security.md.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");

describe("README Security section (item #07)", () => {
  it("has a 'local stdio mode' subsection", () => {
    expect(readme).toContain("Security — local stdio mode");
  });

  it("has an 'HTTP transport' subsection", () => {
    expect(readme).toContain("Security — HTTP transport");
  });

  it("does not still claim there is no relay server", () => {
    expect(readme).not.toMatch(/there'?s no relay server/i);
  });

  it("flags the HTTP transport as multi-tenant", () => {
    expect(readme).toMatch(/multi-tenant/i);
  });

  it("tells operators they are trusted with every active user's cookie", () => {
    expect(readme).toMatch(/operators are trusted/i);
  });
});
