import { describe, expect, it } from "vitest";
import { formatPredictions } from "../../src/tools/search-places.ts";
import type { PlaceSuggestion } from "../../src/types.ts";

/**
 * Item #10 — `wanderlog_search_places` must not echo the raw Google
 * `place_id` (CLAUDE.md invariant #2: no raw IDs to the LLM by default).
 *
 * No downstream tool in this repo accepts a `place_id` argument from the
 * model — `add_place`, `add_hotel`, `remove_place`, `annotate_place`,
 * and `add_expense` all re-resolve from a name string or natural-language
 * reference. So the place_id was pure attack surface.
 *
 * This test fails if either format reintroduces the literal string
 * `place_id` or any `ChIJ…` identifier into the response.
 */

const fixture: PlaceSuggestion[] = [
  {
    description: "Sensō-ji, 2 Chome-3-1 Asakusa, Taito City, Tokyo, Japan",
    place_id: "ChIJ8T1GpMGOGGAR_3w8mmQ-RAg",
    structured_formatting: {
      main_text: "Sensō-ji",
      secondary_text: "2 Chome-3-1 Asakusa, Taito City, Tokyo, Japan",
    },
    types: ["tourist_attraction", "place_of_worship"],
  },
  {
    description: "Tokyo Skytree, 1 Chome-1-2 Oshiage, Sumida City, Tokyo, Japan",
    place_id: "ChIJ35ov0dCOGGARKvdDH7NPHX0",
    structured_formatting: {
      main_text: "Tokyo Skytree",
      secondary_text: "1 Chome-1-2 Oshiage, Sumida City, Tokyo, Japan",
    },
    types: ["tourist_attraction"],
  },
];

describe("formatPredictions — never leaks a Google place_id (item #10)", () => {
  it("concise output contains neither the literal 'place_id' nor any ChIJ id", () => {
    const out = formatPredictions(fixture, "concise");
    expect(out).not.toContain("place_id");
    expect(out).not.toMatch(/ChIJ[\w-]+/);
  });

  it("detailed output contains neither the literal 'place_id' nor any ChIJ id", () => {
    const out = formatPredictions(fixture, "detailed");
    expect(out).not.toContain("place_id");
    expect(out).not.toMatch(/ChIJ[\w-]+/);
  });

  it("still surfaces the human-readable place name and address in both formats", () => {
    for (const format of ["concise", "detailed"] as const) {
      const out = formatPredictions(fixture, format);
      expect(out).toContain("Sensō-ji");
      expect(out).toContain("Tokyo Skytree");
      expect(out).toContain("Asakusa");
    }
  });
});
