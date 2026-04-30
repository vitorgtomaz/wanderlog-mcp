import { z } from "zod";
import type { AppContext } from "../context.js";
import { WanderlogError, WanderlogValidationError } from "../errors.js";
import type { PlaceSuggestion } from "../types.js";
import { findTripCenter, quoteForLLM } from "./shared.js";

export const searchPlacesInputSchema = {
  trip_key: z
    .string()
    .min(1)
    .describe(
      "The trip to scope this search to. Search results are geographically biased toward the trip's destination.",
    ),
  query: z
    .string()
    .min(1)
    .describe(
      "What to search for. Examples: 'sushi restaurant', 'hiking trail', 'coffee near the hotel'.",
    ),
  response_format: z
    .enum(["concise", "detailed"])
    .default("concise")
    .describe(
      "Output verbosity. 'concise' lists name + description; 'detailed' is reserved for future expansion and currently returns the same shape.",
    ),
};

export const searchPlacesDescription = `
Search for real-world places (restaurants, attractions, hotels, parks, landmarks) near the
destination of a Wanderlog trip. Returns candidate results with names and short descriptions.

Use this to resolve user requests like "find a good coffee shop in Queenstown" into specific
place candidates. Results are geographically biased toward the trip's location, not global.

To add a result to the trip, call wanderlog_add_place with the place name from the results
list — the add tool re-resolves the name against Google Places, so you do not need to thread
any opaque identifier through the tool chain.
`.trim();

type Args = {
  trip_key: string;
  query: string;
  response_format?: "concise" | "detailed";
};


export async function searchPlaces(
  ctx: AppContext,
  args: Args,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const entry = await ctx.tripCache.getEntry(args.trip_key);
    const trip = entry.snapshot;
    const center = findTripCenter(trip, entry.geos);
    if (!center) {
      throw new WanderlogValidationError(
        "Cannot determine trip location",
        "This trip has no associated geo and no existing places.",
      );
    }

    const predictions = await ctx.rest.searchPlacesAutocomplete({
      input: args.query,
      sessionToken: crypto.randomUUID(),
      location: { latitude: center.lat, longitude: center.lng },
      radius: 15000,
    });

    if (predictions.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No results for ${quoteForLLM(args.query)} near ${quoteForLLM(trip.title)}. Try broadening the query.`,
          },
        ],
      };
    }

    const text = formatPredictions(predictions, args.response_format ?? "concise");
    return { content: [{ type: "text", text }] };
  } catch (err) {
    const e =
      err instanceof WanderlogError
        ? err.toUserMessage()
        : `Unexpected error: ${(err as Error).message}`;
    return { content: [{ type: "text", text: e }], isError: true };
  }
}

// Exported for unit testing. The `format` argument is currently a no-op
// — concise and detailed produce the same shape. Item #10 dropped the
// raw `place_id` from the detailed output (CLAUDE.md invariant #2: no
// raw IDs to the LLM by default), and at the time of writing the
// detailed branch had no other distinguishing content. The argument is
// kept so a future expansion of detailed (e.g. Google place types) does
// not break the tool surface.
export function formatPredictions(
  predictions: PlaceSuggestion[],
  _format: "concise" | "detailed",
): string {
  const top = predictions.slice(0, 8);
  return top
    .map((p, i) => {
      const main = p.structured_formatting?.main_text ?? p.description;
      const sub = p.structured_formatting?.secondary_text ?? "";
      return `${i + 1}. ${main}${sub ? ` — ${sub}` : ""}`;
    })
    .join("\n");
}
