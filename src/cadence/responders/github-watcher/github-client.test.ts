import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFsFileWriter } from "./github-client.js";

// Only test createFsFileWriter (pure fs operations).
// createGhCliClient tests would require mocking execFile which is
// better covered by integration tests with the real CLI.

describe("createFsFileWriter", () => {
  it("exists() returns false for non-existent files", async () => {
    const writer = createFsFileWriter();
    const result = await writer.exists("/tmp/__does_not_exist_" + Date.now() + ".md");
    expect(result).toBe(false);
  });

  it("write() creates a file and exists() detects it", async () => {
    const writer = createFsFileWriter();
    const testPath = `/tmp/__gh_watcher_test_${Date.now()}.md`;

    await writer.write(testPath, "hello world");
    const exists = await writer.exists(testPath);
    expect(exists).toBe(true);

    // Clean up
    const { unlink } = await import("node:fs/promises");
    await unlink(testPath);
  });

  it("write() creates intermediate directories", async () => {
    const writer = createFsFileWriter();
    const testDir = `/tmp/__gh_watcher_nested_${Date.now()}`;
    const testPath = `${testDir}/sub/file.md`;

    await writer.write(testPath, "nested content");
    const exists = await writer.exists(testPath);
    expect(exists).toBe(true);

    // Clean up
    const { rm } = await import("node:fs/promises");
    await rm(testDir, { recursive: true });
  });
});
