import { describe, expect, it, vi, beforeEach } from "vitest";
import { createSignalBus } from "./signal-bus.js";
import type { Signal } from "./types.js";

function transition(
  from: string | null = null,
  to: string | null = "art",
): Signal<"block_transition"> {
  return {
    type: "block_transition",
    ts: Date.now(),
    payload: {
      from: from ? { id: from, start: "07:00", end: "09:00" } : null,
      to: to ? { id: to, start: "09:00", end: "11:00" } : null,
      planContent: null,
      tasks: [],
    },
  };
}

function idle(blockId: string, minutes: number): Signal<"user_idle"> {
  return {
    type: "user_idle",
    ts: Date.now(),
    payload: {
      block: { id: blockId, start: "09:00", end: "11:00" },
      idleMinutes: minutes,
    },
  };
}

function userActive(blockId: string | null): Signal<"user_active"> {
  return {
    type: "user_active",
    ts: Date.now(),
    payload: {
      block: blockId ? { id: blockId, start: "09:00", end: "11:00" } : null,
    },
  };
}

describe("SignalBus - Core Functionality", () => {
  let bus: ReturnType<typeof createSignalBus>;

  beforeEach(() => {
    bus = createSignalBus();
  });

  it("does nothing when no handlers registered", async () => {
    await expect(bus.emit(transition())).resolves.toBeUndefined();
  });

  it("calls a matching handler", async () => {
    const fn = vi.fn();
    bus.subscribe("block_transition", fn);
    const sig = transition();
    await bus.emit(sig);
    expect(fn).toHaveBeenCalledWith(sig);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("skips handlers for other signal types", async () => {
    const fn = vi.fn();
    bus.subscribe("user_idle", fn);
    await bus.emit(transition());
    expect(fn).not.toHaveBeenCalled();
  });

  it("calls multiple handlers in registration order", async () => {
    const order: number[] = [];
    bus.subscribe("block_transition", () => {
      order.push(1);
    });
    bus.subscribe("block_transition", () => {
      order.push(2);
    });
    bus.subscribe("block_transition", () => {
      order.push(3);
    });
    await bus.emit(transition());
    expect(order).toEqual([1, 2, 3]);
  });

  it("unsubscribes via returned function", async () => {
    const fn = vi.fn();
    const unsub = bus.subscribe("block_transition", fn);
    unsub();
    await bus.emit(transition());
    expect(fn).not.toHaveBeenCalled();
  });

  it("clears all handlers", async () => {
    const fn = vi.fn();
    bus.subscribe("block_transition", fn);
    bus.subscribe("user_idle", fn);
    bus.clear();
    await bus.emit(transition());
    await bus.emit(idle("test", 5));
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("SignalBus - Error Handling", () => {
  let _bus: ReturnType<typeof createSignalBus>;

  beforeEach(() => {
    _bus = createSignalBus();
  });

  it("isolates handler errors and calls all handlers", async () => {
    const onError = vi.fn();
    const bus = createSignalBus({ onError });
    const fn1 = vi.fn(() => {
      throw new Error("boom");
    });
    const fn2 = vi.fn();
    bus.subscribe("block_transition", fn1);
    bus.subscribe("block_transition", fn2);
    await bus.emit(transition());
    expect(fn2).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("block_transition", 0, expect.any(Error));
  });

  it("isolates multiple handler errors", async () => {
    const onError = vi.fn();
    const bus = createSignalBus({ onError });
    const fn1 = vi.fn(() => {
      throw new Error("error1");
    });
    const fn2 = vi.fn(() => {
      throw new Error("error2");
    });
    const fn3 = vi.fn();
    bus.subscribe("block_transition", fn1);
    bus.subscribe("block_transition", fn2);
    bus.subscribe("block_transition", fn3);
    await bus.emit(transition());
    expect(fn3).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(1, "block_transition", 0, expect.any(Error));
    expect(onError).toHaveBeenNthCalledWith(2, "block_transition", 1, expect.any(Error));
  });

  it("reports correct handler index on error", async () => {
    const onError = vi.fn();
    const bus = createSignalBus({ onError });
    bus.subscribe("block_transition", () => {});
    bus.subscribe("block_transition", () => {
      throw new Error("middle");
    });
    bus.subscribe("block_transition", () => {});
    await bus.emit(transition());
    expect(onError).toHaveBeenCalledWith("block_transition", 1, expect.any(Error));
  });

  it("handles errors in async handlers", async () => {
    const onError = vi.fn();
    const bus = createSignalBus({ onError });
    bus.subscribe("block_transition", async () => {
      await Promise.resolve();
      throw new Error("async error");
    });
    await bus.emit(transition());
    expect(onError).toHaveBeenCalledWith("block_transition", 0, expect.any(Error));
  });

  it("handles non-Error thrown values", async () => {
    const onError = vi.fn();
    const bus = createSignalBus({ onError });
    bus.subscribe("block_transition", () => {
      throw "string error";
    });
    await bus.emit(transition());
    expect(onError).toHaveBeenCalledWith("block_transition", 0, "string error");
  });

  it("handles null/undefined thrown", async () => {
    const onError = vi.fn();
    const bus = createSignalBus({ onError });
    bus.subscribe("block_transition", () => {
      throw null;
    });
    await bus.emit(transition());
    expect(onError).toHaveBeenCalledWith("block_transition", 0, null);
  });

  it("does not call onError when no error occurs", async () => {
    const onError = vi.fn();
    const bus = createSignalBus({ onError });
    bus.subscribe("block_transition", () => {});
    await bus.emit(transition());
    expect(onError).not.toHaveBeenCalled();
  });

  it("onError callback is optional", async () => {
    const bus = createSignalBus();
    bus.subscribe("block_transition", () => {
      throw new Error("test");
    });
    await expect(bus.emit(transition())).resolves.toBeUndefined();
  });
});

describe("SignalBus - Async Handlers", () => {
  let bus: ReturnType<typeof createSignalBus>;

  beforeEach(() => {
    bus = createSignalBus();
  });

  it("waits for async handlers to complete", async () => {
    const order: string[] = [];
    bus.subscribe("block_transition", async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("async");
    });
    bus.subscribe("block_transition", () => {
      order.push("sync");
    });
    await bus.emit(transition());
    expect(order).toEqual(["async", "sync"]);
  });

  it("maintains handler order with mixed async/sync", async () => {
    const order: number[] = [];
    bus.subscribe("block_transition", async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push(1);
    });
    bus.subscribe("block_transition", () => {
      order.push(2);
    });
    bus.subscribe("block_transition", async () => {
      await new Promise((r) => setTimeout(r, 1));
      order.push(3);
    });
    await bus.emit(transition());
    expect(order).toEqual([1, 2, 3]);
  });

  it("sequential execution of handlers", async () => {
    const timeline: number[] = [];
    const start = Date.now();
    bus.subscribe("block_transition", async () => {
      timeline.push(Date.now() - start);
      await new Promise((r) => setTimeout(r, 20));
    });
    bus.subscribe("block_transition", async () => {
      timeline.push(Date.now() - start);
      await new Promise((r) => setTimeout(r, 20));
    });
    await bus.emit(transition());
    // Rough check: second should start after first ends
    expect(timeline[1]).toBeGreaterThanOrEqual(timeline[0] + 15);
  });
});

describe("SignalBus - Subscribe/Unsubscribe", () => {
  let bus: ReturnType<typeof createSignalBus>;

  beforeEach(() => {
    bus = createSignalBus();
  });

  it("multiple unsubscribes of same handler is safe", async () => {
    const fn = vi.fn();
    const unsub = bus.subscribe("block_transition", fn);
    unsub();
    unsub(); // Should not error
    await bus.emit(transition());
    expect(fn).not.toHaveBeenCalled();
  });

  it("unsubscribe only affects the specific handler", async () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const unsub = bus.subscribe("block_transition", fn1);
    bus.subscribe("block_transition", fn2);
    unsub();
    await bus.emit(transition());
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  it("can resubscribe after unsubscribe", async () => {
    const fn = vi.fn();
    const unsub = bus.subscribe("block_transition", fn);
    unsub();
    bus.subscribe("block_transition", fn);
    await bus.emit(transition());
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe of different handlers for same type", async () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const fn3 = vi.fn();
    const unsub1 = bus.subscribe("block_transition", fn1);
    const unsub2 = bus.subscribe("block_transition", fn2);
    bus.subscribe("block_transition", fn3);
    unsub1();
    unsub2();
    await bus.emit(transition());
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
    expect(fn3).toHaveBeenCalled();
  });

  it("subscribing same handler twice registers twice", async () => {
    const fn = vi.fn();
    bus.subscribe("block_transition", fn);
    bus.subscribe("block_transition", fn);
    await bus.emit(transition());
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe only removes first occurrence of handler", async () => {
    const fn = vi.fn();
    const unsub = bus.subscribe("block_transition", fn);
    bus.subscribe("block_transition", fn);
    unsub();
    await bus.emit(transition());
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("SignalBus - Multiple Signal Types", () => {
  let bus: ReturnType<typeof createSignalBus>;

  beforeEach(() => {
    bus = createSignalBus();
  });

  it("handles multiple signal types independently", async () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const fn3 = vi.fn();
    bus.subscribe("block_transition", fn1);
    bus.subscribe("user_idle", fn2);
    bus.subscribe("user_active", fn3);
    await bus.emit(transition());
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).not.toHaveBeenCalled();
    expect(fn3).not.toHaveBeenCalled();
  });

  it("emits different signal types without interference", async () => {
    const order: string[] = [];
    bus.subscribe("block_transition", () => order.push("transition"));
    bus.subscribe("user_idle", () => order.push("idle"));
    bus.subscribe("user_active", () => order.push("active"));
    await bus.emit(transition());
    await bus.emit(idle("test", 5));
    await bus.emit(userActive("test"));
    expect(order).toEqual(["transition", "idle", "active"]);
  });

  it("clear removes all signal types", async () => {
    const fn = vi.fn();
    bus.subscribe("block_transition", fn);
    bus.subscribe("user_idle", fn);
    bus.subscribe("user_active", fn);
    bus.subscribe("heartbeat_tick", fn);
    bus.clear();
    await bus.emit(transition());
    await bus.emit(idle("test", 5));
    await bus.emit(userActive("test"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("clearing then resubscribing works", async () => {
    const fn = vi.fn();
    bus.subscribe("block_transition", fn);
    bus.clear();
    bus.subscribe("block_transition", fn);
    await bus.emit(transition());
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("SignalBus - Edge Cases", () => {
  let bus: ReturnType<typeof createSignalBus>;

  beforeEach(() => {
    bus = createSignalBus();
  });

  it("handles rapid successive emissions", async () => {
    const fn = vi.fn();
    bus.subscribe("block_transition", fn);
    await Promise.all([bus.emit(transition()), bus.emit(transition()), bus.emit(transition())]);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("emits safely even if handler subscribes during emit", async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    bus.subscribe("block_transition", () => {
      outer();
      bus.subscribe("block_transition", inner);
    });
    await bus.emit(transition());
    expect(outer).toHaveBeenCalled();
    // Inner handler is now registered and will be called on next emit
    await bus.emit(transition());
    expect(inner).toHaveBeenCalled();
  });

  it("allows handler to unsubscribe itself", async () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const unsub1 = bus.subscribe("block_transition", fn1);
    bus.subscribe("block_transition", () => {
      unsub1(); // Unsubscribe fn1 during iteration
    });
    bus.subscribe("block_transition", fn2);
    // First emit calls handlers in order
    await bus.emit(transition());
    expect(fn1).toHaveBeenCalled();
    // After first emit, fn1 is unsubscribed, so second emit won't call it
    await bus.emit(transition());
    expect(fn1).toHaveBeenCalledTimes(1);
  });

  it("handler can emit other signals", async () => {
    const called: string[] = [];
    bus.subscribe("block_transition", async () => {
      called.push("transition");
      await bus.emit(idle("test", 5));
    });
    bus.subscribe("user_idle", () => {
      called.push("idle");
    });
    await bus.emit(transition());
    expect(called).toEqual(["transition", "idle"]);
  });

  it("handles large number of handlers", async () => {
    const fns = Array.from({ length: 100 }, () => vi.fn());
    fns.forEach((fn) => bus.subscribe("block_transition", fn));
    await bus.emit(transition());
    fns.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
  });

  it("handlers receive the exact signal object", async () => {
    const fn = vi.fn();
    bus.subscribe("block_transition", fn);
    const sig = transition("start", "end");
    await bus.emit(sig);
    expect(fn).toHaveBeenCalledWith(sig);
    expect(fn.mock.calls[0][0]).toBe(sig); // Same reference
  });

  it("signal with null payload values", async () => {
    const fn = vi.fn();
    bus.subscribe("block_transition", fn);
    const sig = transition(null, null);
    await bus.emit(sig);
    expect(fn).toHaveBeenCalledWith(sig);
    expect(fn.mock.calls[0][0].payload.from).toBeNull();
    expect(fn.mock.calls[0][0].payload.to).toBeNull();
  });
});

describe("SignalBus - Type Safety", () => {
  let bus: ReturnType<typeof createSignalBus>;

  beforeEach(() => {
    bus = createSignalBus();
  });

  it("correctly typed handlers receive correct payload", async () => {
    const fn = vi.fn<[Signal<"user_idle">], void>();
    bus.subscribe("user_idle", fn);
    const sig = idle("myblock", 10);
    await bus.emit(sig);
    expect(fn).toHaveBeenCalledWith(sig);
    const payload = fn.mock.calls[0][0].payload;
    expect(payload.idleMinutes).toBe(10);
    expect(payload.block.id).toBe("myblock");
  });

  it("handler for one type doesn't receive another type", async () => {
    const fn = vi.fn<[Signal<"block_transition">], void>();
    bus.subscribe("block_transition", fn);
    await bus.emit(idle("test", 5));
    expect(fn).not.toHaveBeenCalled();
  });
});
