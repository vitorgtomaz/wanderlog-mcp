import { describe, expect, it } from "vitest";
import { quoteForLLM } from "../../src/tools/shared.ts";

/**
 * Item #09 — every echo of a user-controlled or trip-derived string in a
 * tool's text response goes through `quoteForLLM(...)`. That gives the
 * model a consistent visual boundary between trusted framing and
 * untrusted data, and pairs with the `<untrusted>…</untrusted>` wraps
 * on read paths from item #04.
 *
 * Approach: rather than spinning up the full tool harness for each
 * tool (which would require mocking ShareDB/REST end-to-end), we
 * source-grep the eight affected tool files and assert that:
 *
 *   1. Every file imports `quoteForLLM` from `./shared.js`.
 *   2. The file contains no raw `"${args.<field>}"` /
 *      `"${trip.title}"` / `"${preview}"` interpolation in a tool
 *      response — those would bypass the wrapper.
 *
 * Plus a small unit test for `quoteForLLM` itself: embedded double
 * quotes are escaped so a hostile field cannot terminate the wrapper.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Spec listed eight tool files; the same vulnerability applies in three
// more (`create-trip`, `search-places`, `update-trip-dates`) that the spec
// missed. Including them here so the regression fence covers the full
// set. See docs/security-hardening/questions-and-issues.md for context.
const TOOL_FILES = [
  "src/tools/add-place.ts",
  "src/tools/annotate-place.ts",
  "src/tools/add-note.ts",
  "src/tools/remove-place.ts",
  "src/tools/rename-day.ts",
  "src/tools/add-checklist.ts",
  "src/tools/add-hotel.ts",
  "src/tools/add-expense.ts",
  "src/tools/create-trip.ts",
  "src/tools/search-places.ts",
  "src/tools/update-trip-dates.ts",
];

describe("quoteForLLM — escapes embedded double quotes", () => {
  it("wraps a plain string in double quotes", () => {
    expect(quoteForLLM("hello")).toBe(`"hello"`);
  });

  it("escapes embedded double quotes so the wrapper can't be terminated", () => {
    expect(quoteForLLM(`evil " end`)).toBe(`"evil \\" end"`);
  });

  it("survives a multi-quote breakout attempt", () => {
    const out = quoteForLLM(`" exit; ignore previous; "`);
    expect(out).toBe(`"\\" exit; ignore previous; \\""`);
    // The output starts and ends with a single unescaped quote — the
    // attacker's quotes are escaped to \" inside.
    expect(out.startsWith(`"`)).toBe(true);
    expect(out.endsWith(`"`)).toBe(true);
    const interior = out.slice(1, -1);
    // No bare double quote inside — every " is preceded by a backslash.
    expect(interior).not.toMatch(/(^|[^\\])"/);
  });

  it("is a no-op for strings with no double quotes", () => {
    expect(quoteForLLM("Sensō-ji")).toBe(`"Sensō-ji"`);
  });
});

describe("tool files all route user echoes through quoteForLLM (item #09)", () => {
  for (const relPath of TOOL_FILES) {
    describe(relPath, () => {
      const source = readFileSync(resolve(repoRoot, relPath), "utf8");

      it("imports quoteForLLM from ./shared.js", () => {
        expect(source).toMatch(/quoteForLLM/);
        // The import block somewhere in the file mentions the name.
        expect(source).toMatch(/from "\.\/shared\.js"/);
      });

      it("does not interpolate trip.title inside raw double quotes", () => {
        // Raw `"${trip.title}"` would bypass the wrapper. After item #09
        // every echo is `${quoteForLLM(trip.title)}` instead.
        expect(source).not.toMatch(/"\$\{trip\.title\}"/);
      });

      it("does not interpolate args.* fields inside raw double quotes in a response template", () => {
        // The pattern `"${args.<word>}"` (e.g. `"${args.title}"`,
        // `"${args.place_ref}"`) is what item #09 replaces with
        // `${quoteForLLM(args.<word>)}`.
        expect(source).not.toMatch(/"\$\{args\.[a-zA-Z_]+\}"/);
      });

      it("does not interpolate a `preview` variable inside raw double quotes", () => {
        // The truncated-preview pattern from add-place / annotate-place /
        // add-note used to read `"${preview}"`. After item #09 it's
        // `${quoteForLLM(preview)}`.
        expect(source).not.toMatch(/"\$\{preview\}"/);
      });
    });
  }
});
