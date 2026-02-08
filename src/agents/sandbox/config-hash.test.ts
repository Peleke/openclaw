import { describe, expect, it } from "vitest";
import { computeSandboxConfigHash } from "./config-hash.js";
import type { SandboxDockerConfig } from "./types.js";

const baseDocker: SandboxDockerConfig = {
  image: "openclaw-sandbox:bookworm-slim",
  containerPrefix: "openclaw-sbx-",
  workdir: "/workspace",
  readOnlyRoot: true,
  tmpfs: ["/tmp"],
  network: "none",
  capDrop: ["ALL"],
};

const baseInput = {
  docker: baseDocker,
  workspaceAccess: "none" as const,
  workspaceDir: "/sandbox/ws",
  agentWorkspaceDir: "/home/agent",
};

describe("computeSandboxConfigHash — networkAllow/networkDocker", () => {
  it("hash is stable without network fields", () => {
    const a = computeSandboxConfigHash(baseInput);
    const b = computeSandboxConfigHash(baseInput);
    expect(a).toBe(b);
  });

  it("hash changes when networkAllow is added", () => {
    const without = computeSandboxConfigHash(baseInput);
    const withAllow = computeSandboxConfigHash({
      ...baseInput,
      networkAllow: ["exec", "web_fetch"],
    });
    expect(without).not.toBe(withAllow);
  });

  it("hash changes when networkDocker is added", () => {
    const without = computeSandboxConfigHash(baseInput);
    const withDocker = computeSandboxConfigHash({
      ...baseInput,
      networkDocker: { ...baseDocker, network: "bridge" },
    });
    expect(without).not.toBe(withDocker);
  });

  it("hash changes when networkDocker.network changes", () => {
    const bridge = computeSandboxConfigHash({
      ...baseInput,
      networkAllow: ["exec"],
      networkDocker: { ...baseDocker, network: "bridge" },
    });
    const custom = computeSandboxConfigHash({
      ...baseInput,
      networkAllow: ["exec"],
      networkDocker: { ...baseDocker, network: "custom-net" },
    });
    expect(bridge).not.toBe(custom);
  });

  it("hash unchanged when networkAllow is absent (backward compat)", () => {
    const a = computeSandboxConfigHash(baseInput);
    const b = computeSandboxConfigHash({ ...baseInput, networkAllow: undefined });
    expect(a).toBe(b);
  });
});
