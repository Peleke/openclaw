import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the dynamic imports used by the CLI action handlers
vi.mock("../infra/gateway-http.js", () => ({
  fetchGatewayJson: vi.fn(),
}));

vi.mock("../green/cli-status.js", () => ({
  formatGreenStatus: vi.fn(() => "[DB] Green status output"),
  formatGreenStatusFromApi: vi.fn(() => "[API] Green status output"),
}));

vi.mock("../green/store.js", () => ({
  openGreenDb: vi.fn(() => ({
    close: vi.fn(),
  })),
}));

vi.mock("../agents/agent-paths.js", () => ({
  resolveOpenClawAgentDir: vi.fn(() => "/tmp/test-agent-dir"),
}));

vi.mock("../infra/gateway-url.js", () => ({
  resolveGatewayUrl: vi.fn(
    (opts?: { host?: string; port?: string }) =>
      `http://${opts?.host ?? "127.0.0.1"}:${opts?.port ?? "18789"}`,
  ),
}));

import { Command } from "commander";
import { registerGreenCli } from "./green-cli.js";
import { fetchGatewayJson } from "../infra/gateway-http.js";
import { formatGreenStatus, formatGreenStatusFromApi } from "../green/cli-status.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("green status CLI action", () => {
  it("uses API data when gateway returns all three endpoints", async () => {
    const mockFetch = vi.mocked(fetchGatewayJson);
    mockFetch.mockResolvedValueOnce({ traceCount: 5 }); // summary
    mockFetch.mockResolvedValueOnce({ enabled: true }); // config
    mockFetch.mockResolvedValueOnce({ targets: [] }); // targets

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const program = new Command();
    program.exitOverride();
    registerGreenCli(program);
    await program.parseAsync(["node", "test", "green", "status"], { from: "node" });

    console.log = origLog;

    expect(formatGreenStatusFromApi).toHaveBeenCalledOnce();
    expect(formatGreenStatus).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[API]");
  });

  it("falls back to local DB when gateway returns null", async () => {
    const mockFetch = vi.mocked(fetchGatewayJson);
    mockFetch.mockResolvedValue(null); // all three fail

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const program = new Command();
    program.exitOverride();
    registerGreenCli(program);
    await program.parseAsync(["node", "test", "green", "status"], { from: "node" });

    console.log = origLog;

    expect(formatGreenStatus).toHaveBeenCalledOnce();
    expect(formatGreenStatusFromApi).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[DB]");
  });

  it("falls back when only some API endpoints succeed", async () => {
    const mockFetch = vi.mocked(fetchGatewayJson);
    mockFetch.mockResolvedValueOnce({ traceCount: 5 }); // summary OK
    mockFetch.mockResolvedValueOnce(null); // config fails
    mockFetch.mockResolvedValueOnce({ targets: [] }); // targets OK

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const program = new Command();
    program.exitOverride();
    registerGreenCli(program);
    await program.parseAsync(["node", "test", "green", "status"], { from: "node" });

    console.log = origLog;

    // If any endpoint fails, should fall back to DB
    expect(formatGreenStatus).toHaveBeenCalledOnce();
    expect(formatGreenStatusFromApi).not.toHaveBeenCalled();
  });

  it("passes --host and --port to fetchGatewayJson", async () => {
    const mockFetch = vi.mocked(fetchGatewayJson);
    mockFetch.mockResolvedValue(null);

    const origLog = console.log;
    console.log = () => {};

    const program = new Command();
    program.exitOverride();
    registerGreenCli(program);
    await program.parseAsync(
      ["node", "test", "green", "status", "--host", "10.0.0.1", "--port", "9999"],
      {
        from: "node",
      },
    );

    console.log = origLog;

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ host: "10.0.0.1", port: "9999" }),
    );
  });
});

describe("green dashboard CLI action", () => {
  it("prints dashboard URL with defaults", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const program = new Command();
    program.exitOverride();
    registerGreenCli(program);
    await program.parseAsync(["node", "test", "green", "dashboard"], { from: "node" });

    console.log = origLog;

    expect(logs.join("\n")).toContain("/__openclaw__/api/green/dashboard");
  });

  it("prints dashboard URL with custom host/port", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const program = new Command();
    program.exitOverride();
    registerGreenCli(program);
    await program.parseAsync(
      ["node", "test", "green", "dashboard", "--host", "myhost", "--port", "3000"],
      {
        from: "node",
      },
    );

    console.log = origLog;

    expect(logs.join("\n")).toContain("http://myhost:3000");
  });
});
