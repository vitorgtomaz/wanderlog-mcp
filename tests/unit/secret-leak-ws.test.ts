import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { WanderlogError } from "../../src/errors.ts";

/**
 * Item #08 — secret-leak canary, ShareDB WebSocket transport.
 *
 * The cookie is passed to `new WebSocket(url, { headers: { Cookie } })` in
 * `src/transport/sharedb.ts`. None of the error paths (handshake timeout,
 * 401 upgrade, server error frame, send-after-close) currently echo the
 * cookie back into an error message. This canary plants a sentinel cookie
 * and asserts that invariant holds — and will keep holding if a future
 * change starts including request context in error messages.
 *
 * Pairs with `tests/unit/secret-leak.test.ts` (REST canary). Together they
 * cover all three transports that touch the cookie.
 */

const SENTINEL = "s%3ASENTINEL-WS-COOKIE.signaturepart";
const SENTINEL_FRAGMENTS = [SENTINEL, "SENTINEL-WS-COOKIE", "signaturepart"];

function containsSentinel(s: string): string | null {
  for (const f of SENTINEL_FRAGMENTS) {
    if (s.includes(f)) return f;
  }
  return null;
}

function leakSurfaces(err: unknown): string[] {
  const e = err as Error & { toUserMessage?: () => string; stack?: string };
  return [
    e.message ?? "",
    e.stack ?? "",
    e instanceof WanderlogError ? e.toUserMessage() : "",
    JSON.stringify(e, Object.getOwnPropertyNames(e)),
  ];
}

function assertNoSentinel(err: unknown): void {
  for (const s of leakSurfaces(err)) {
    const hit = containsSentinel(s);
    if (hit) {
      throw new Error(
        `secret leak: WS error surface contained '${hit}'\n--- surface ---\n${s}`,
      );
    }
  }
}

// Hand-rolled WebSocket double. The real `ws` module exports a class with a
// numeric `OPEN` static and instances that are EventEmitters with `.send`,
// `.close`, `.readyState`. We reproduce just enough to drive the code paths
// in `ShareDBClient` deterministically.
class FakeWebSocket extends EventEmitter {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static readonly instances: FakeWebSocket[] = [];

  readyState: number = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  constructor(public readonly url: string, public readonly opts: unknown) {
    super();
    FakeWebSocket.instances.push(this);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", 1000);
  }
}

vi.mock("ws", () => ({ default: FakeWebSocket }));

// Imported AFTER the mock so the SUT picks up the fake.
const { ShareDBClient } = await import("../../src/transport/sharedb.ts");

describe("secret-leak canary — ShareDB WS errors do not include the cookie", () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeClient(): InstanceType<typeof ShareDBClient> {
    return new ShareDBClient(
      {
        cookieHeader: `connect.sid=${SENTINEL}`,
        baseUrl: "https://wanderlog.test",
        wsBaseUrl: "wss://wanderlog.test",
        userAgent: "wanderdog-test",
      },
      "abc123",
    );
  }

  // Attach the rejection handler synchronously (via .then(_, _)) before
  // advancing fake timers, otherwise the rejection is unattended for a
  // micro-tick and Node's unhandled-rejection tracker complains.
  function trapRejection(p: Promise<unknown>): Promise<unknown> {
    const trapped = p.then(
      () => Promise.reject(new Error("expected rejection, got resolve")),
      (err) => err,
    );
    return trapped;
  }

  it("handshake timeout error does not include the cookie", async () => {
    const client = makeClient();
    const trapped = trapRejection(client.connect());
    await vi.advanceTimersByTimeAsync(10_001);
    const err = await trapped;
    assertNoSentinel(err);
    expect(err).toBeInstanceOf(WanderlogError);
  });

  it("401 upgrade error (auth failure) does not include the cookie", async () => {
    const client = makeClient();
    const trapped = trapRejection(client.connect());
    const ws = FakeWebSocket.instances[0]!;
    ws.emit("unexpected-response", {}, { statusCode: 401 });
    const err = await trapped;
    assertNoSentinel(err);
  });

  it("WebSocket-level error during handshake does not include the cookie", async () => {
    const client = makeClient();
    const trapped = trapRejection(client.connect());
    const ws = FakeWebSocket.instances[0]!;
    ws.emit("error", new Error("ECONNRESET — boom"));
    const err = await trapped;
    assertNoSentinel(err);
  });

  it("submit-before-subscribe error does not include the cookie", async () => {
    const client = makeClient();
    const trapped = trapRejection(
      client.submit([{ p: ["title"], oi: "x" }] as never),
    );
    const err = await trapped;
    assertNoSentinel(err);
    expect(err).toBeInstanceOf(WanderlogError);
  });
});
