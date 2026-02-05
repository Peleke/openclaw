import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveGatewayHost, resolveGatewayUrlPort, resolveGatewayUrl } from "./gateway-url.js";

describe("resolveGatewayHost", () => {
  afterEach(() => {
    delete process.env.OPENCLAW_GATEWAY_HOST;
  });

  it("returns opts.host when provided", () => {
    process.env.OPENCLAW_GATEWAY_HOST = "10.0.0.1";
    expect(resolveGatewayHost({ host: "192.168.1.1" })).toBe("192.168.1.1");
  });

  it("returns env OPENCLAW_GATEWAY_HOST when no opts.host", () => {
    process.env.OPENCLAW_GATEWAY_HOST = "100.64.1.2";
    expect(resolveGatewayHost()).toBe("100.64.1.2");
  });

  it("trims whitespace from env var", () => {
    process.env.OPENCLAW_GATEWAY_HOST = "  10.0.0.5  ";
    expect(resolveGatewayHost()).toBe("10.0.0.5");
  });

  it("returns 127.0.0.1 when no opts and no env", () => {
    delete process.env.OPENCLAW_GATEWAY_HOST;
    expect(resolveGatewayHost()).toBe("127.0.0.1");
  });

  it("ignores empty env var", () => {
    process.env.OPENCLAW_GATEWAY_HOST = "";
    expect(resolveGatewayHost()).toBe("127.0.0.1");
  });

  it("ignores whitespace-only env var", () => {
    process.env.OPENCLAW_GATEWAY_HOST = "   ";
    expect(resolveGatewayHost()).toBe("127.0.0.1");
  });

  it("opts.host takes priority over env", () => {
    process.env.OPENCLAW_GATEWAY_HOST = "env-host";
    expect(resolveGatewayHost({ host: "cli-host" })).toBe("cli-host");
  });
});

describe("resolveGatewayUrlPort", () => {
  afterEach(() => {
    delete process.env.OPENCLAW_GATEWAY_PORT;
  });

  it("returns opts.port as number when provided", () => {
    expect(resolveGatewayUrlPort({ port: 9999 })).toBe(9999);
  });

  it("returns opts.port as string when provided", () => {
    expect(resolveGatewayUrlPort({ port: "8080" })).toBe(8080);
  });

  it("returns default port when no opts.port", () => {
    expect(resolveGatewayUrlPort()).toBe(18789);
  });

  it("ignores invalid string port", () => {
    expect(resolveGatewayUrlPort({ port: "garbage" })).toBe(18789);
  });

  it("ignores zero port", () => {
    expect(resolveGatewayUrlPort({ port: 0 })).toBe(18789);
  });

  it("ignores negative port", () => {
    expect(resolveGatewayUrlPort({ port: -1 })).toBe(18789);
  });

  it("env OPENCLAW_GATEWAY_PORT is used when no opts.port", () => {
    process.env.OPENCLAW_GATEWAY_PORT = "5555";
    expect(resolveGatewayUrlPort()).toBe(5555);
  });

  it("opts.port takes priority over env", () => {
    process.env.OPENCLAW_GATEWAY_PORT = "5555";
    expect(resolveGatewayUrlPort({ port: 7777 })).toBe(7777);
  });
});

describe("resolveGatewayUrl", () => {
  afterEach(() => {
    delete process.env.OPENCLAW_GATEWAY_HOST;
    delete process.env.OPENCLAW_GATEWAY_PORT;
  });

  it("returns full URL with defaults", () => {
    expect(resolveGatewayUrl()).toBe("http://127.0.0.1:18789");
  });

  it("uses custom host and port", () => {
    expect(resolveGatewayUrl({ host: "10.0.0.1", port: 3000 })).toBe("http://10.0.0.1:3000");
  });

  it("uses env vars", () => {
    process.env.OPENCLAW_GATEWAY_HOST = "100.64.1.5";
    process.env.OPENCLAW_GATEWAY_PORT = "4444";
    expect(resolveGatewayUrl()).toBe("http://100.64.1.5:4444");
  });

  it("opts override env vars", () => {
    process.env.OPENCLAW_GATEWAY_HOST = "100.64.1.5";
    process.env.OPENCLAW_GATEWAY_PORT = "4444";
    expect(resolveGatewayUrl({ host: "myhost", port: 1234 })).toBe("http://myhost:1234");
  });

  it("handles string port in opts", () => {
    expect(resolveGatewayUrl({ port: "8080" })).toBe("http://127.0.0.1:8080");
  });

  it("handles IPv6 host", () => {
    expect(resolveGatewayUrl({ host: "::1", port: 18789 })).toBe("http://::1:18789");
  });
});
