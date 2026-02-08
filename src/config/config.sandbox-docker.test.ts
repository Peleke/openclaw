import { describe, expect, it, vi } from "vitest";

describe("sandbox docker config", () => {
  it("accepts binds array in sandbox.docker config", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            docker: {
              binds: ["/var/run/docker.sock:/var/run/docker.sock", "/home/user/source:/source:rw"],
            },
          },
        },
        list: [
          {
            id: "main",
            sandbox: {
              docker: {
                image: "custom-sandbox:latest",
                binds: ["/home/user/projects:/projects:ro"],
              },
            },
          },
        ],
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.agents?.defaults?.sandbox?.docker?.binds).toEqual([
        "/var/run/docker.sock:/var/run/docker.sock",
        "/home/user/source:/source:rw",
      ]);
      expect(res.config.agents?.list?.[0]?.sandbox?.docker?.binds).toEqual([
        "/home/user/projects:/projects:ro",
      ]);
    }
  });

  it("accepts networkAllow + networkDocker in sandbox config", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            networkAllow: ["group:web", "exec"],
            networkDocker: { network: "bridge", dns: ["1.1.1.1"] },
          },
        },
        list: [
          {
            id: "main",
            sandbox: {
              networkAllow: ["web_fetch"],
              networkDocker: { network: "custom-net" },
            },
          },
        ],
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.agents?.defaults?.sandbox?.networkAllow).toEqual(["group:web", "exec"]);
      expect(res.config.agents?.defaults?.sandbox?.networkDocker?.network).toBe("bridge");
      expect(res.config.agents?.list?.[0]?.sandbox?.networkAllow).toEqual(["web_fetch"]);
      expect(res.config.agents?.list?.[0]?.sandbox?.networkDocker?.network).toBe("custom-net");
    }
  });

  it("accepts config without networkAllow (backward compat)", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            docker: { network: "none" },
          },
        },
      },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects non-array networkAllow", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            networkAllow: "exec",
          },
        },
      },
    });
    expect(res.ok).toBe(false);
  });

  it("rejects non-string values in binds array", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            docker: {
              binds: [123, "/valid/path:/path"],
            },
          },
        },
      },
    });
    expect(res.ok).toBe(false);
  });
});
