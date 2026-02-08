import { describe, expect, it } from "vitest";
import type { SandboxToolPolicy } from "./types.js";
import { isToolAllowed, isToolNetworkAllowed } from "./tool-policy.js";

describe("sandbox tool policy", () => {
  it("allows all tools with * allow", () => {
    const policy: SandboxToolPolicy = { allow: ["*"], deny: [] };
    expect(isToolAllowed(policy, "browser")).toBe(true);
  });

  it("denies all tools with * deny", () => {
    const policy: SandboxToolPolicy = { allow: [], deny: ["*"] };
    expect(isToolAllowed(policy, "read")).toBe(false);
  });

  it("supports wildcard patterns", () => {
    const policy: SandboxToolPolicy = { allow: ["web_*"] };
    expect(isToolAllowed(policy, "web_fetch")).toBe(true);
    expect(isToolAllowed(policy, "read")).toBe(false);
  });
});

describe("isToolNetworkAllowed", () => {
  it("returns false when networkAllow is undefined", () => {
    expect(isToolNetworkAllowed("exec", undefined)).toBe(false);
  });

  it("returns false when networkAllow is empty", () => {
    expect(isToolNetworkAllowed("exec", [])).toBe(false);
  });

  it("returns true for exact match", () => {
    expect(isToolNetworkAllowed("exec", ["exec"])).toBe(true);
  });

  it("returns false for non-matching tool", () => {
    expect(isToolNetworkAllowed("read", ["exec"])).toBe(false);
  });

  it("supports wildcard patterns", () => {
    expect(isToolNetworkAllowed("web_fetch", ["web_*"])).toBe(true);
    expect(isToolNetworkAllowed("web_search", ["web_*"])).toBe(true);
    expect(isToolNetworkAllowed("exec", ["web_*"])).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isToolNetworkAllowed("Exec", ["exec"])).toBe(true);
    expect(isToolNetworkAllowed("exec", ["EXEC"])).toBe(true);
  });

  it("expands tool groups", () => {
    expect(isToolNetworkAllowed("web_search", ["group:web"])).toBe(true);
    expect(isToolNetworkAllowed("web_fetch", ["group:web"])).toBe(true);
    expect(isToolNetworkAllowed("exec", ["group:web"])).toBe(false);
  });

  it("handles multiple patterns", () => {
    expect(isToolNetworkAllowed("exec", ["web_*", "exec"])).toBe(true);
    expect(isToolNetworkAllowed("read", ["web_*", "exec"])).toBe(false);
  });

  it("returns false for empty string tool name", () => {
    expect(isToolNetworkAllowed("", ["exec"])).toBe(false);
  });

  it("returns false for whitespace-only tool name", () => {
    expect(isToolNetworkAllowed("   ", ["exec"])).toBe(false);
  });

  it("handles tool names with regex special characters", () => {
    expect(isToolNetworkAllowed("web.fetch", ["web_*"])).toBe(false);
    expect(isToolNetworkAllowed("web(fetch)", ["web_*"])).toBe(false);
  });

  it("trims whitespace in tool name before matching", () => {
    expect(isToolNetworkAllowed("  exec  ", ["exec"])).toBe(true);
  });
});
