/**
 * Thalamus router tests — exhaustive coverage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createThalamus, type Thalamus, type ThalamusHandler } from "./index.js";
import type { OpenClawSignal } from "../signals.js";

// Factory for test signals
function makeSignal(
  type: OpenClawSignal["type"],
  payload: Record<string, unknown> = {},
): OpenClawSignal {
  return {
    type,
    ts: Date.now(),
    id: crypto.randomUUID(),
    payload,
  } as OpenClawSignal;
}

function makeObsidianSignal(path: string, content: string): OpenClawSignal {
  return makeSignal("obsidian.note.modified", {
    path,
    content,
    frontmatter: {},
  });
}

function makeHandler(id: string): ThalamusHandler & { handle: ReturnType<typeof vi.fn> } {
  return {
    id,
    handle: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Thalamus Router", () => {
  describe("Basic Routing", () => {
    it("dispatches to matching handler", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "route-1",
            match: { signalTypes: ["obsidian.note.modified"] },
            dispatch: ["handler-1"],
          },
        ],
      });

      const handler = makeHandler("handler-1");
      thalamus.registerHandler(handler);

      const signal = makeObsidianSignal("/test.md", "content");
      const result = await thalamus.route(signal);

      expect(result.matchedRoutes).toEqual(["route-1"]);
      expect(result.dispatchedTo).toEqual(["handler-1"]);
      expect(handler.handle).toHaveBeenCalledWith(signal, "route-1");
    });

    it("does not dispatch when no routes match", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "route-1",
            match: { signalTypes: ["file.changed"] },
            dispatch: ["handler-1"],
          },
        ],
      });

      const handler = makeHandler("handler-1");
      thalamus.registerHandler(handler);

      const signal = makeObsidianSignal("/test.md", "content");
      const result = await thalamus.route(signal);

      expect(result.matchedRoutes).toEqual([]);
      expect(result.dispatchedTo).toEqual([]);
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it("uses default dispatch when no routes match", async () => {
      const thalamus = createThalamus({
        routes: [],
        defaultDispatch: ["fallback-handler"],
      });

      const handler = makeHandler("fallback-handler");
      thalamus.registerHandler(handler);

      const signal = makeObsidianSignal("/test.md", "content");
      const result = await thalamus.route(signal);

      expect(result.matchedRoutes).toEqual([]);
      expect(result.dispatchedTo).toEqual(["fallback-handler"]);
      expect(handler.handle).toHaveBeenCalled();
    });

    it("dispatches to multiple handlers in parallel", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "route-1",
            match: { signalTypes: ["obsidian.note.modified"] },
            dispatch: ["handler-1", "handler-2", "handler-3"],
          },
        ],
      });

      const handlers = [
        makeHandler("handler-1"),
        makeHandler("handler-2"),
        makeHandler("handler-3"),
      ];
      handlers.forEach((h) => thalamus.registerHandler(h));

      const signal = makeObsidianSignal("/test.md", "content");
      const result = await thalamus.route(signal);

      expect(result.dispatchedTo).toHaveLength(3);
      handlers.forEach((h) => expect(h.handle).toHaveBeenCalledOnce());
    });

    it("skips disabled routes", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "disabled-route",
            match: { signalTypes: ["obsidian.note.modified"] },
            dispatch: ["handler-1"],
            disabled: true,
          },
          {
            id: "enabled-route",
            match: { signalTypes: ["obsidian.note.modified"] },
            dispatch: ["handler-2"],
          },
        ],
      });

      const handler1 = makeHandler("handler-1");
      const handler2 = makeHandler("handler-2");
      thalamus.registerHandler(handler1);
      thalamus.registerHandler(handler2);

      const signal = makeObsidianSignal("/test.md", "content");
      const result = await thalamus.route(signal);

      expect(result.matchedRoutes).toEqual(["enabled-route"]);
      expect(handler1.handle).not.toHaveBeenCalled();
      expect(handler2.handle).toHaveBeenCalled();
    });

    it("stops at terminal routes", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "terminal-route",
            match: { signalTypes: ["obsidian.note.modified"] },
            dispatch: ["handler-1"],
            terminal: true,
          },
          {
            id: "never-reached",
            match: { signalTypes: ["obsidian.note.modified"] },
            dispatch: ["handler-2"],
          },
        ],
      });

      const handler1 = makeHandler("handler-1");
      const handler2 = makeHandler("handler-2");
      thalamus.registerHandler(handler1);
      thalamus.registerHandler(handler2);

      const signal = makeObsidianSignal("/test.md", "content");
      const result = await thalamus.route(signal);

      expect(result.matchedRoutes).toEqual(["terminal-route"]);
      expect(handler1.handle).toHaveBeenCalled();
      expect(handler2.handle).not.toHaveBeenCalled();
    });
  });

  describe("Signal Type Matching", () => {
    it("matches single signal type", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "route",
            match: { signalTypes: ["file.changed"] },
            dispatch: ["handler"],
          },
        ],
      });

      const handler = makeHandler("handler");
      thalamus.registerHandler(handler);

      // Should match
      await thalamus.route(makeSignal("file.changed", { path: "/x", event: "add" }));
      expect(handler.handle).toHaveBeenCalledTimes(1);

      // Should not match
      await thalamus.route(makeSignal("obsidian.note.modified", {}));
      expect(handler.handle).toHaveBeenCalledTimes(1);
    });

    it("matches multiple signal types (OR logic)", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "route",
            match: { signalTypes: ["file.changed", "obsidian.note.modified"] },
            dispatch: ["handler"],
          },
        ],
      });

      const handler = makeHandler("handler");
      thalamus.registerHandler(handler);

      await thalamus.route(makeSignal("file.changed", { path: "/x", event: "add" }));
      await thalamus.route(makeObsidianSignal("/y.md", "content"));

      expect(handler.handle).toHaveBeenCalledTimes(2);
    });

    it("matches all signal types when signalTypes is empty", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "catch-all",
            match: { signalTypes: [] },
            dispatch: ["handler"],
          },
        ],
      });

      const handler = makeHandler("handler");
      thalamus.registerHandler(handler);

      await thalamus.route(makeSignal("file.changed", { path: "/x", event: "add" }));
      await thalamus.route(makeObsidianSignal("/y.md", "content"));
      await thalamus.route(makeSignal("heartbeat.tick", { ts: Date.now() }));

      expect(handler.handle).toHaveBeenCalledTimes(3);
    });
  });

  describe("Path Pattern Matching", () => {
    let thalamus: Thalamus;
    let handler: ThalamusHandler & { handle: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      thalamus = createThalamus({
        routes: [
          {
            id: "journal-route",
            match: {
              signalTypes: ["obsidian.note.modified"],
              pathPatterns: ["Journal/**"],
            },
            dispatch: ["handler"],
          },
        ],
      });
      handler = makeHandler("handler");
      thalamus.registerHandler(handler);
    });

    it("matches exact directory prefix", async () => {
      await thalamus.route(makeObsidianSignal("Journal/2024-01-01.md", "content"));
      expect(handler.handle).toHaveBeenCalled();
    });

    it("matches nested paths with **", async () => {
      await thalamus.route(makeObsidianSignal("Journal/2024/January/01.md", "content"));
      expect(handler.handle).toHaveBeenCalled();
    });

    it("rejects non-matching paths", async () => {
      await thalamus.route(makeObsidianSignal("Notes/random.md", "content"));
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it("handles multiple path patterns (OR logic)", async () => {
      const multiThalamus = createThalamus({
        routes: [
          {
            id: "multi-route",
            match: {
              signalTypes: ["obsidian.note.modified"],
              pathPatterns: ["Journal/**", "Thoughts/**", "Content/**"],
            },
            dispatch: ["handler"],
          },
        ],
      });
      const multiHandler = makeHandler("handler");
      multiThalamus.registerHandler(multiHandler);

      await multiThalamus.route(makeObsidianSignal("Journal/a.md", "x"));
      await multiThalamus.route(makeObsidianSignal("Thoughts/b.md", "y"));
      await multiThalamus.route(makeObsidianSignal("Content/c.md", "z"));
      await multiThalamus.route(makeObsidianSignal("Other/d.md", "w"));

      expect(multiHandler.handle).toHaveBeenCalledTimes(3);
    });

    it("handles single segment wildcard *", async () => {
      const wildcardThalamus = createThalamus({
        routes: [
          {
            id: "wildcard-route",
            match: {
              signalTypes: ["obsidian.note.modified"],
              pathPatterns: ["Journal/*/notes.md"],
            },
            dispatch: ["handler"],
          },
        ],
      });
      const wildcardHandler = makeHandler("handler");
      wildcardThalamus.registerHandler(wildcardHandler);

      await wildcardThalamus.route(makeObsidianSignal("Journal/2024/notes.md", "x"));
      expect(wildcardHandler.handle).toHaveBeenCalledTimes(1);

      // Should NOT match nested
      await wildcardThalamus.route(makeObsidianSignal("Journal/2024/01/notes.md", "y"));
      expect(wildcardHandler.handle).toHaveBeenCalledTimes(1);
    });
  });

  describe("Magic String Matching", () => {
    it("matches content starting with magic string", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "publish-route",
            match: {
              signalTypes: ["obsidian.note.modified"],
              magicString: "::publish",
            },
            dispatch: ["handler"],
          },
        ],
      });

      const handler = makeHandler("handler");
      thalamus.registerHandler(handler);

      await thalamus.route(makeObsidianSignal("/test.md", "::publish\n\n# Title"));
      expect(handler.handle).toHaveBeenCalled();
    });

    it("rejects content without magic string", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "publish-route",
            match: {
              signalTypes: ["obsidian.note.modified"],
              magicString: "::publish",
            },
            dispatch: ["handler"],
          },
        ],
      });

      const handler = makeHandler("handler");
      thalamus.registerHandler(handler);

      await thalamus.route(makeObsidianSignal("/test.md", "# Regular note"));
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it("rejects magic string not at start", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "publish-route",
            match: {
              signalTypes: ["obsidian.note.modified"],
              magicString: "::publish",
            },
            dispatch: ["handler"],
          },
        ],
      });

      const handler = makeHandler("handler");
      thalamus.registerHandler(handler);

      await thalamus.route(makeObsidianSignal("/test.md", "# Title\n\n::publish"));
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it("handles various magic string formats", async () => {
      const formats = ["::publish", "@publish", "#!extract", ">>>PROCESS"];

      for (const magic of formats) {
        const thalamus = createThalamus({
          routes: [
            {
              id: "route",
              match: { magicString: magic },
              dispatch: ["handler"],
            },
          ],
        });

        const handler = makeHandler("handler");
        thalamus.registerHandler(handler);

        await thalamus.route(makeObsidianSignal("/test.md", `${magic}\ncontent`));
        expect(handler.handle).toHaveBeenCalled();
      }
    });
  });

  describe("Custom Matchers", () => {
    it("uses custom matcher function", async () => {
      const customMatcher = vi.fn().mockReturnValue(true);

      const thalamus = createThalamus({
        routes: [
          {
            id: "custom-route",
            match: { custom: customMatcher },
            dispatch: ["handler"],
          },
        ],
      });

      const handler = makeHandler("handler");
      thalamus.registerHandler(handler);

      const signal = makeObsidianSignal("/test.md", "content");
      await thalamus.route(signal);

      expect(customMatcher).toHaveBeenCalledWith(signal);
      expect(handler.handle).toHaveBeenCalled();
    });

    it("respects custom matcher returning false", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "custom-route",
            match: { custom: () => false },
            dispatch: ["handler"],
          },
        ],
      });

      const handler = makeHandler("handler");
      thalamus.registerHandler(handler);

      await thalamus.route(makeObsidianSignal("/test.md", "content"));
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it("combines custom matcher with other criteria (AND logic)", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "combined-route",
            match: {
              signalTypes: ["obsidian.note.modified"],
              magicString: "::publish",
              custom: (signal) => {
                const content = (signal.payload as { content: string }).content;
                return content.includes("IMPORTANT");
              },
            },
            dispatch: ["handler"],
          },
        ],
      });

      const handler = makeHandler("handler");
      thalamus.registerHandler(handler);

      // Missing magic string
      await thalamus.route(makeObsidianSignal("/a.md", "IMPORTANT content"));
      expect(handler.handle).not.toHaveBeenCalled();

      // Missing IMPORTANT
      await thalamus.route(makeObsidianSignal("/b.md", "::publish\nregular content"));
      expect(handler.handle).not.toHaveBeenCalled();

      // Has both
      await thalamus.route(makeObsidianSignal("/c.md", "::publish\nIMPORTANT content"));
      expect(handler.handle).toHaveBeenCalledOnce();
    });
  });

  describe("Handler Management", () => {
    it("registers and unregisters handlers", () => {
      const thalamus = createThalamus({ routes: [] });

      const handler = makeHandler("test-handler");
      thalamus.registerHandler(handler);

      expect(thalamus.getHandlerIds()).toContain("test-handler");

      thalamus.unregisterHandler("test-handler");
      expect(thalamus.getHandlerIds()).not.toContain("test-handler");
    });

    it("replaces handler with same ID", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "route",
            match: {},
            dispatch: ["handler"],
          },
        ],
      });

      const handler1 = makeHandler("handler");
      const handler2 = makeHandler("handler");

      thalamus.registerHandler(handler1);
      thalamus.registerHandler(handler2);

      await thalamus.route(makeObsidianSignal("/test.md", "content"));

      expect(handler1.handle).not.toHaveBeenCalled();
      expect(handler2.handle).toHaveBeenCalled();
    });

    it("skips dispatch to unregistered handlers", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "route",
            match: {},
            dispatch: ["registered", "unregistered"],
          },
        ],
      });

      const handler = makeHandler("registered");
      thalamus.registerHandler(handler);

      const result = await thalamus.route(makeObsidianSignal("/test.md", "content"));

      expect(result.dispatchedTo).toEqual(["registered"]);
      expect(handler.handle).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("catches handler errors and continues", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "route",
            match: {},
            dispatch: ["failing", "succeeding"],
          },
        ],
      });

      const failingHandler: ThalamusHandler = {
        id: "failing",
        handle: vi.fn().mockRejectedValue(new Error("Handler exploded")),
      };
      const succeedingHandler = makeHandler("succeeding");

      thalamus.registerHandler(failingHandler);
      thalamus.registerHandler(succeedingHandler);

      const result = await thalamus.route(makeObsidianSignal("/test.md", "content"));

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].handlerId).toBe("failing");
      expect(result.errors[0].error.message).toBe("Handler exploded");

      // Succeeding handler should still be called
      expect(succeedingHandler.handle).toHaveBeenCalled();
      expect(result.dispatchedTo).toContain("succeeding");
    });

    it("handles multiple handler errors", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "route",
            match: {},
            dispatch: ["fail1", "fail2", "success"],
          },
        ],
      });

      thalamus.registerHandler({
        id: "fail1",
        handle: vi.fn().mockRejectedValue(new Error("Error 1")),
      });
      thalamus.registerHandler({
        id: "fail2",
        handle: vi.fn().mockRejectedValue(new Error("Error 2")),
      });
      thalamus.registerHandler(makeHandler("success"));

      const result = await thalamus.route(makeObsidianSignal("/test.md", "content"));

      expect(result.errors).toHaveLength(2);
      expect(result.dispatchedTo).toEqual(["success"]);
    });

    it("converts non-Error throws to Error", async () => {
      const thalamus = createThalamus({
        routes: [{ id: "route", match: {}, dispatch: ["handler"] }],
      });

      thalamus.registerHandler({
        id: "handler",
        handle: vi.fn().mockRejectedValue("string error"),
      });

      const result = await thalamus.route(makeObsidianSignal("/test.md", "content"));

      expect(result.errors[0].error).toBeInstanceOf(Error);
      expect(result.errors[0].error.message).toBe("string error");
    });
  });

  describe("Route Deduplication", () => {
    it("deduplicates handlers across multiple matching routes", async () => {
      const thalamus = createThalamus({
        routes: [
          {
            id: "route-1",
            match: { signalTypes: ["obsidian.note.modified"] },
            dispatch: ["shared-handler", "handler-1"],
          },
          {
            id: "route-2",
            match: { magicString: "::publish" },
            dispatch: ["shared-handler", "handler-2"],
          },
        ],
      });

      const sharedHandler = makeHandler("shared-handler");
      const handler1 = makeHandler("handler-1");
      const handler2 = makeHandler("handler-2");

      thalamus.registerHandler(sharedHandler);
      thalamus.registerHandler(handler1);
      thalamus.registerHandler(handler2);

      await thalamus.route(makeObsidianSignal("/test.md", "::publish\ncontent"));

      // shared-handler should only be called once despite matching both routes
      expect(sharedHandler.handle).toHaveBeenCalledOnce();
      expect(handler1.handle).toHaveBeenCalledOnce();
      expect(handler2.handle).toHaveBeenCalledOnce();
    });
  });

  describe("Config Accessors", () => {
    it("returns current config", () => {
      const config = {
        routes: [{ id: "test", match: {}, dispatch: [] }],
        debug: true,
      };

      const thalamus = createThalamus(config);
      expect(thalamus.getConfig()).toEqual(config);
    });

    it("returns registered handler IDs", () => {
      const thalamus = createThalamus({ routes: [] });

      thalamus.registerHandler(makeHandler("a"));
      thalamus.registerHandler(makeHandler("b"));
      thalamus.registerHandler(makeHandler("c"));

      expect(thalamus.getHandlerIds().sort()).toEqual(["a", "b", "c"]);
    });
  });
});
