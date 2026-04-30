import { z } from "zod";
import type { AppContext } from "../context.js";
import { WanderlogError } from "../errors.js";
import type { TripPlan } from "../types.js";

export const getTripUrlInputSchema = {
  trip_key: z
    .string()
    .min(1)
    .describe("The trip key from wanderlog_list_trips."),
  mode: z
    .enum(["edit", "view", "suggest"])
    .default("view")
    .describe(
      "Which link variant to return. 'view' (default) is a read-only link that's safe to share. 'edit' is a full-permission link — anyone who has it can edit the trip, so only request it when the user explicitly asks for an editable link. 'suggest' is a suggest-mode share link where collaborators can propose changes.",
    ),
};

export const getTripUrlDescription = `
Returns the wanderlog.com URL for a trip so the user can open it in a browser.

Three link variants are available via the mode parameter:
  - view    (default) — read-only link, safe to share with anyone
  - edit    — full-permission link; anyone with this URL can edit the trip
  - suggest — suggest-mode link where collaborators can propose changes

Default to view. Only request mode: "edit" when the user explicitly asks
for an editable link (e.g. "give me a link I can edit", "send me the edit
URL"), and warn them that an edit URL grants write access to anyone who
has it — they should keep it private.
`.trim();

type Args = {
  trip_key: string;
  mode?: "edit" | "view" | "suggest";
};

export function pickKey(trip: TripPlan, mode: "edit" | "view" | "suggest"): string {
  if (mode === "view") return trip.viewKey ?? trip.editKey ?? trip.key;
  if (mode === "suggest") return trip.suggestKey ?? trip.editKey ?? trip.key;
  return trip.editKey ?? trip.key;
}

export function buildTripUrl(
  trip: TripPlan,
  mode: "edit" | "view" | "suggest",
  baseUrl = "https://wanderlog.com",
): string {
  return `${baseUrl}/plan/${pickKey(trip, mode)}`;
}

export async function getTripUrl(
  ctx: AppContext,
  args: Args,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const trip = await ctx.tripCache.get(args.trip_key);
    const mode = args.mode ?? "view";
    const url = buildTripUrl(trip, mode, ctx.config.baseUrl);

    const suffix =
      mode === "view"
        ? "\n(Read-only link — safe to share.)"
        : mode === "suggest"
          ? "\n(Suggest-mode link — collaborators can propose changes.)"
          : "\n(Edit link — anyone with this URL can edit the trip. Keep it private.)";
    return { content: [{ type: "text", text: `${url}${suffix}` }] };
  } catch (err) {
    const msg =
      err instanceof WanderlogError
        ? err.toUserMessage()
        : `Unexpected error: ${(err as Error).message}`;
    return { content: [{ type: "text", text: msg }], isError: true };
  }
}
