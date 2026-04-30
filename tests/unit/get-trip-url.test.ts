import { describe, expect, it } from "vitest";
import {
  buildTripUrl,
  getTripUrl,
  pickKey,
} from "../../src/tools/get-trip-url.ts";
import { queenstownTrip } from "../fixtures/queenstown-trip.ts";
import type { AppContext } from "../../src/context.ts";
import type { TripPlan } from "../../src/types.ts";

function ctxFor(trip: TripPlan): AppContext {
  return {
    config: { baseUrl: "https://wanderlog.com" },
    tripCache: { get: async (_key: string) => trip },
  } as unknown as AppContext;
}

describe("pickKey", () => {
  it("edit mode returns editKey", () => {
    expect(pickKey(queenstownTrip, "edit")).toBe("vzyrsyhgxvonvxcz");
  });

  it("view mode returns viewKey", () => {
    expect(pickKey(queenstownTrip, "view")).toBe("qsqxrlrzov");
  });

  it("suggest mode returns suggestKey", () => {
    expect(pickKey(queenstownTrip, "suggest")).toBe("zztknrxgjxrv");
  });

  it("view mode falls back to editKey when viewKey is missing", () => {
    const trip: TripPlan = { ...queenstownTrip, viewKey: undefined };
    expect(pickKey(trip, "view")).toBe("vzyrsyhgxvonvxcz");
  });

  it("suggest mode falls back to editKey when suggestKey is missing", () => {
    const trip: TripPlan = { ...queenstownTrip, suggestKey: undefined };
    expect(pickKey(trip, "suggest")).toBe("vzyrsyhgxvonvxcz");
  });

  it("falls back to trip.key when neither editKey nor mode-specific key exists", () => {
    const trip: TripPlan = {
      ...queenstownTrip,
      editKey: undefined,
      viewKey: undefined,
      suggestKey: undefined,
    };
    expect(pickKey(trip, "edit")).toBe("vzyrsyhgxvonvxcz");
    expect(pickKey(trip, "view")).toBe("vzyrsyhgxvonvxcz");
  });
});

describe("buildTripUrl", () => {
  it("builds an edit URL with the default base", () => {
    expect(buildTripUrl(queenstownTrip, "edit")).toBe(
      "https://wanderlog.com/plan/vzyrsyhgxvonvxcz",
    );
  });

  it("builds a view URL", () => {
    expect(buildTripUrl(queenstownTrip, "view")).toBe(
      "https://wanderlog.com/plan/qsqxrlrzov",
    );
  });

  it("builds a suggest URL", () => {
    expect(buildTripUrl(queenstownTrip, "suggest")).toBe(
      "https://wanderlog.com/plan/zztknrxgjxrv",
    );
  });

  it("honors a custom base URL", () => {
    expect(
      buildTripUrl(queenstownTrip, "edit", "https://staging.wanderlog.com"),
    ).toBe("https://staging.wanderlog.com/plan/vzyrsyhgxvonvxcz");
  });
});

/**
 * Item #05: the default link variant must be `view` (read-only). Edit URLs
 * are bearer tokens — anyone holding one can mutate the trip — so the LLM
 * must opt in explicitly when the user asks for an editable link.
 */
describe("getTripUrl — secure-by-default mode (item #05)", () => {
  it("returns the read-only view URL when mode is omitted", async () => {
    const ctx = ctxFor(queenstownTrip);
    const result = await getTripUrl(ctx, { trip_key: "any" });
    expect(result.isError).toBeFalsy();
    const text = result.content[0]!.text;
    expect(text).toContain("https://wanderlog.com/plan/qsqxrlrzov");
    expect(text).not.toContain("vzyrsyhgxvonvxcz");
    expect(text).toContain("Read-only");
  });

  it("returns the edit URL with a 'keep it private' warning when mode='edit'", async () => {
    const ctx = ctxFor(queenstownTrip);
    const result = await getTripUrl(ctx, { trip_key: "any", mode: "edit" });
    expect(result.isError).toBeFalsy();
    const text = result.content[0]!.text;
    expect(text).toContain("https://wanderlog.com/plan/vzyrsyhgxvonvxcz");
    expect(text).toMatch(/anyone with this URL can edit/i);
    expect(text).toMatch(/private/i);
  });

  it("returns the suggest URL with the suggest-mode caption when mode='suggest'", async () => {
    const ctx = ctxFor(queenstownTrip);
    const result = await getTripUrl(ctx, { trip_key: "any", mode: "suggest" });
    expect(result.isError).toBeFalsy();
    const text = result.content[0]!.text;
    expect(text).toContain("https://wanderlog.com/plan/zztknrxgjxrv");
    expect(text).toMatch(/Suggest-mode/i);
  });
});
