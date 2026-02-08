import { describe, expect, it } from "vitest";
import { resolveSandboxConfigForAgent, resolveSandboxNetworkDockerConfig } from "./config.js";
import type { SandboxDockerConfig } from "./types.js";

describe("resolveSandboxNetworkDockerConfig", () => {
  const baseDocker: SandboxDockerConfig = {
    image: "openclaw-sandbox:bookworm-slim",
    containerPrefix: "openclaw-sbx-",
    workdir: "/workspace",
    readOnlyRoot: true,
    tmpfs: ["/tmp"],
    network: "none",
    capDrop: ["ALL"],
    env: { LANG: "C.UTF-8" },
  };

  it("defaults network to bridge", () => {
    const result = resolveSandboxNetworkDockerConfig({
      scope: "agent",
      baseDocker,
    });
    expect(result.network).toBe("bridge");
  });

  it("inherits base docker config", () => {
    const result = resolveSandboxNetworkDockerConfig({
      scope: "agent",
      baseDocker,
    });
    expect(result.image).toBe(baseDocker.image);
    expect(result.workdir).toBe(baseDocker.workdir);
    expect(result.capDrop).toEqual(["ALL"]);
  });

  it("applies global networkDocker overrides", () => {
    const result = resolveSandboxNetworkDockerConfig({
      scope: "agent",
      baseDocker,
      globalNetworkDocker: { image: "custom:net", dns: ["1.1.1.1"] },
    });
    expect(result.image).toBe("custom:net");
    expect(result.dns).toEqual(["1.1.1.1"]);
    expect(result.network).toBe("bridge");
  });

  it("agent overrides take precedence over global", () => {
    const result = resolveSandboxNetworkDockerConfig({
      scope: "agent",
      baseDocker,
      globalNetworkDocker: { network: "custom-net" },
      agentNetworkDocker: { network: "agent-net" },
    });
    expect(result.network).toBe("agent-net");
  });

  it("ignores agent overrides for shared scope", () => {
    const result = resolveSandboxNetworkDockerConfig({
      scope: "shared",
      baseDocker,
      globalNetworkDocker: { network: "custom-net" },
      agentNetworkDocker: { network: "agent-net" },
    });
    expect(result.network).toBe("custom-net");
  });

  it("merges env from all layers", () => {
    const result = resolveSandboxNetworkDockerConfig({
      scope: "agent",
      baseDocker: { ...baseDocker, env: { LANG: "C.UTF-8", FOO: "base" } },
      globalNetworkDocker: { env: { BAR: "global" } },
      agentNetworkDocker: { env: { BAZ: "agent" } },
    });
    expect(result.env).toEqual({ LANG: "C.UTF-8", FOO: "base", BAR: "global", BAZ: "agent" });
  });
});

describe("resolveSandboxConfigForAgent — networkAllow", () => {
  it("returns undefined networkAllow/networkDocker when not configured", () => {
    const cfg = resolveSandboxConfigForAgent(undefined, undefined);
    expect(cfg.networkAllow).toBeUndefined();
    expect(cfg.networkDocker).toBeUndefined();
  });

  it("returns undefined for empty networkAllow array", () => {
    const cfg = resolveSandboxConfigForAgent(
      { agents: { defaults: { sandbox: { networkAllow: [] } } } },
      undefined,
    );
    expect(cfg.networkAllow).toBeUndefined();
    expect(cfg.networkDocker).toBeUndefined();
  });

  it("resolves networkAllow with group expansion", () => {
    const cfg = resolveSandboxConfigForAgent(
      { agents: { defaults: { sandbox: { networkAllow: ["group:web"] } } } },
      undefined,
    );
    expect(cfg.networkAllow).toContain("web_search");
    expect(cfg.networkAllow).toContain("web_fetch");
  });

  it("resolves networkDocker when networkAllow is present", () => {
    const cfg = resolveSandboxConfigForAgent(
      { agents: { defaults: { sandbox: { networkAllow: ["exec"] } } } },
      undefined,
    );
    expect(cfg.networkDocker).toBeDefined();
    expect(cfg.networkDocker!.network).toBe("bridge");
  });

  it("agent-level networkAllow overrides global", () => {
    const cfg = resolveSandboxConfigForAgent(
      {
        agents: {
          defaults: { sandbox: { networkAllow: ["group:web"] } },
          list: [{ id: "test", sandbox: { networkAllow: ["exec"] } }],
        },
      },
      "test",
    );
    expect(cfg.networkAllow).toContain("exec");
    expect(cfg.networkAllow).not.toContain("web_search");
  });
});
