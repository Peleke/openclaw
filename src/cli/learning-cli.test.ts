import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../infra/gateway-http.js", () => ({
  fetchGatewayJson: vi.fn(),
}));

vi.mock("../learning/cli-status.js", () => ({
  formatLearningStatusFromApi: vi.fn(() => "[API] Learning status output"),
  formatLearningStatusFromQortex: vi.fn(async () => "[Qortex] Learning status output"),
}));

vi.mock("../learning/cli-export.js", () => ({
  exportLearningDataFromQortex: vi.fn(async () => '{"posteriors":[]}'),
}));

vi.mock("../infra/gateway-url.js", () => ({
  resolveGatewayUrl: vi.fn(
    (opts?: { host?: string; port?: string }) =>
      `http://${opts?.host ?? "127.0.0.1"}:${opts?.port ?? "18789"}`,
  ),
}));

import { Command } from "commander";
import { registerLearningCli } from "./learning-cli.js";
import { fetchGatewayJson } from "../infra/gateway-http.js";
import {
  formatLearningStatusFromApi,
  formatLearningStatusFromQortex,
} from "../learning/cli-status.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("learning status CLI action", () => {
  it("uses API data when gateway returns all three endpoints", async () => {
    const mockFetch = vi.mocked(fetchGatewayJson);
    mockFetch.mockResolvedValueOnce({ traceCount: 5 }); // summary
    mockFetch.mockResolvedValueOnce({ phase: "active" }); // config
    mockFetch.mockResolvedValueOnce([]); // posteriors

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const program = new Command();
    program.exitOverride();
    registerLearningCli(program);
    await program.parseAsync(["node", "test", "learning", "status"], { from: "node" });

    console.log = origLog;

    expect(formatLearningStatusFromApi).toHaveBeenCalledOnce();
    expect(formatLearningStatusFromQortex).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[API]");
  });

  it("falls back to direct qortex MCP when gateway returns null", async () => {
    const mockFetch = vi.mocked(fetchGatewayJson);
    mockFetch.mockResolvedValue(null);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const program = new Command();
    program.exitOverride();
    registerLearningCli(program);
    await program.parseAsync(["node", "test", "learning", "status"], { from: "node" });

    console.log = origLog;

    expect(formatLearningStatusFromQortex).toHaveBeenCalledOnce();
    expect(formatLearningStatusFromApi).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[Qortex]");
  });

  it("falls back when only some API endpoints succeed", async () => {
    const mockFetch = vi.mocked(fetchGatewayJson);
    mockFetch.mockResolvedValueOnce({ traceCount: 5 }); // summary OK
    mockFetch.mockResolvedValueOnce({ phase: "active" }); // config OK
    mockFetch.mockResolvedValueOnce(null); // posteriors fail

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const program = new Command();
    program.exitOverride();
    registerLearningCli(program);
    await program.parseAsync(["node", "test", "learning", "status"], { from: "node" });

    console.log = origLog;

    expect(formatLearningStatusFromQortex).toHaveBeenCalledOnce();
    expect(formatLearningStatusFromApi).not.toHaveBeenCalled();
  });

  it("passes --host and --port to fetchGatewayJson", async () => {
    const mockFetch = vi.mocked(fetchGatewayJson);
    mockFetch.mockResolvedValue(null);

    const origLog = console.log;
    console.log = () => {};

    const program = new Command();
    program.exitOverride();
    registerLearningCli(program);
    await program.parseAsync(
      ["node", "test", "learning", "status", "--host", "10.0.0.1", "--port", "9999"],
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

describe("learning dashboard CLI action", () => {
  it("prints dashboard URL with defaults", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const program = new Command();
    program.exitOverride();
    registerLearningCli(program);
    await program.parseAsync(["node", "test", "learning", "dashboard"], { from: "node" });

    console.log = origLog;

    expect(logs.join("\n")).toContain("/__openclaw__/api/learning/dashboard");
  });

  it("prints dashboard URL with custom host/port", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const program = new Command();
    program.exitOverride();
    registerLearningCli(program);
    await program.parseAsync(
      ["node", "test", "learning", "dashboard", "--host", "myhost", "--port", "3000"],
      { from: "node" },
    );

    console.log = origLog;

    expect(logs.join("\n")).toContain("http://myhost:3000");
  });
});
