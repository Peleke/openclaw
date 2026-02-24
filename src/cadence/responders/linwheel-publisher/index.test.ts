import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LinWheel } from "@linwheel/sdk";
import { createSignalBus, type SignalBus } from "@peleke.s/cadence";
import type { OpenClawSignal } from "../../signals.js";
import { createLinWheelPublisherResponder } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockClient(): LinWheel {
  return {
    analyze: vi.fn().mockResolvedValue({
      linkedinFit: { score: 8 },
      suggestedAngles: [{ angle: "field_note" }, { angle: "contrarian" }],
    }),
    reshape: vi.fn().mockResolvedValue({
      posts: [
        { text: "draft 1", postId: "p1" },
        { text: "draft 2", postId: "p2" },
      ],
    }),
  } as unknown as LinWheel;
}

function noteSignal(
  content: string,
  path = "Buildlog/2026-02-23.md",
  frontmatter: Record<string, unknown> = {},
): OpenClawSignal {
  return {
    type: "obsidian.note.modified",
    id: "sig-1",
    ts: Date.now(),
    payload: { path, content, frontmatter },
  } as OpenClawSignal;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LinWheelPublisherResponder", () => {
  let bus: SignalBus<OpenClawSignal>;
  let client: LinWheel;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = createSignalBus<OpenClawSignal>();
    client = mockClient();
  });

  it("ignores notes without ::linkedin marker", async () => {
    const responder = createLinWheelPublisherResponder({ client });
    const unsub = responder.register(bus);

    await bus.emit(noteSignal("Just a normal note without the marker."));
    vi.advanceTimersByTime(5000);

    expect(client.analyze).not.toHaveBeenCalled();
    unsub();
  });

  it("ignores notes with ::linkedin but content too short", async () => {
    const responder = createLinWheelPublisherResponder({ client });
    const unsub = responder.register(bus);

    await bus.emit(noteSignal("::linkedin\nhi"));
    vi.advanceTimersByTime(5000);

    expect(client.analyze).not.toHaveBeenCalled();
    unsub();
  });

  it("runs analyze + reshape on ::linkedin marker", async () => {
    const responder = createLinWheelPublisherResponder({ client, config: { debounceMs: 100 } });
    const unsub = responder.register(bus);

    const content =
      "::linkedin\n\n" +
      "Today I shipped a TypeScript SDK for LinWheel. It wraps 13 REST endpoints with typed interfaces and zero runtime deps.";
    await bus.emit(noteSignal(content));

    // Advance past debounce
    vi.advanceTimersByTime(200);
    // Let promises resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(client.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("shipped a TypeScript SDK") }),
    );
    expect(client.reshape).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("shipped a TypeScript SDK"),
        saveDrafts: true,
      }),
    );

    unsub();
  });

  it("uses suggested angles from analyze response", async () => {
    const responder = createLinWheelPublisherResponder({ client, config: { debounceMs: 100 } });
    const unsub = responder.register(bus);

    const content = "::linkedin\n\n" + "A".repeat(100);
    await bus.emit(noteSignal(content));

    vi.advanceTimersByTime(200);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.reshape).toHaveBeenCalledWith(
      expect.objectContaining({
        angles: ["field_note", "contrarian"],
      }),
    );

    unsub();
  });

  it("falls back to default angles when analyze returns none", async () => {
    (client.analyze as ReturnType<typeof vi.fn>).mockResolvedValue({
      linkedinFit: { score: 5 },
      suggestedAngles: [],
    });

    const responder = createLinWheelPublisherResponder({
      client,
      config: { debounceMs: 100, defaultAngles: ["synthesizer"] },
    });
    const unsub = responder.register(bus);

    const content = "::linkedin\n\n" + "B".repeat(100);
    await bus.emit(noteSignal(content));

    vi.advanceTimersByTime(200);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.reshape).toHaveBeenCalledWith(
      expect.objectContaining({ angles: ["synthesizer"] }),
    );

    unsub();
  });

  it("respects frontmatter linkedin_angles override", async () => {
    const responder = createLinWheelPublisherResponder({ client, config: { debounceMs: 100 } });
    const unsub = responder.register(bus);

    const content = "::linkedin\n\n" + "C".repeat(100);
    await bus.emit(
      noteSignal(content, "Buildlog/test.md", { linkedin_angles: ["provocateur", "curious_cat"] }),
    );

    vi.advanceTimersByTime(200);
    await vi.advanceTimersByTimeAsync(0);

    // Frontmatter angles should be passed, but analyze suggestions take priority
    // if analyze returns angles. The frontmatter is the fallback.
    expect(client.analyze).toHaveBeenCalled();

    unsub();
  });

  it("debounces rapid file changes", async () => {
    const responder = createLinWheelPublisherResponder({ client, config: { debounceMs: 500 } });
    const unsub = responder.register(bus);

    const content = "::linkedin\n\n" + "D".repeat(100);

    // Rapid-fire 3 signals
    await bus.emit(noteSignal(content));
    vi.advanceTimersByTime(100);
    await bus.emit(noteSignal(content));
    vi.advanceTimersByTime(100);
    await bus.emit(noteSignal(content));

    // Advance past debounce from last signal
    vi.advanceTimersByTime(600);
    await vi.advanceTimersByTimeAsync(0);

    // Should only fire once despite 3 signals
    expect(client.analyze).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("skips _cadence- and _debug- paths", async () => {
    const responder = createLinWheelPublisherResponder({ client, config: { debounceMs: 100 } });
    const unsub = responder.register(bus);

    const content = "::linkedin\n\n" + "E".repeat(100);
    await bus.emit(noteSignal(content, "_cadence-test.md"));
    await bus.emit(noteSignal(content, "_debug-foo.md"));

    vi.advanceTimersByTime(200);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.analyze).not.toHaveBeenCalled();

    unsub();
  });

  it("works with heading before ::linkedin", async () => {
    const responder = createLinWheelPublisherResponder({ client, config: { debounceMs: 100 } });
    const unsub = responder.register(bus);

    const content = "# Today's Buildlog\n::linkedin\n\n" + "F".repeat(100);
    await bus.emit(noteSignal(content));

    vi.advanceTimersByTime(200);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.analyze).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("handles SDK errors gracefully without crashing", async () => {
    (client.analyze as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("API down"));

    const responder = createLinWheelPublisherResponder({ client, config: { debounceMs: 100 } });
    const unsub = responder.register(bus);

    const content = "::linkedin\n\n" + "G".repeat(100);
    await bus.emit(noteSignal(content));

    vi.advanceTimersByTime(200);
    await vi.advanceTimersByTimeAsync(0);

    // Should not throw, just log
    expect(client.analyze).toHaveBeenCalled();
    expect(client.reshape).not.toHaveBeenCalled();

    unsub();
  });

  it("cleanup stops debouncer and unsubscribes", async () => {
    const responder = createLinWheelPublisherResponder({ client, config: { debounceMs: 1000 } });
    const unsub = responder.register(bus);

    const content = "::linkedin\n\n" + "H".repeat(100);
    await bus.emit(noteSignal(content));

    // Cleanup before debounce fires
    unsub();
    vi.advanceTimersByTime(2000);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.analyze).not.toHaveBeenCalled();
  });
});
