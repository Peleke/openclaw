import { describe, it, expect } from "vitest";
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  parseSynthesisResponse,
} from "./prompts.js";
import type { RepoScanResult } from "./types.js";

function makeRepo(overrides: Partial<RepoScanResult> = {}): RepoScanResult {
  return {
    name: "test-repo",
    fullName: "Peleke/test-repo",
    mergedPRs: [],
    openPRs: [],
    buildlogEntries: [],
    ...overrides,
  };
}

describe("buildSynthesisSystemPrompt", () => {
  it("returns a non-empty system prompt", () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("mentions LinkedIn", () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain("LinkedIn");
  });

  it("mentions first person", () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain("first person");
  });
});

describe("buildSynthesisUserPrompt", () => {
  it("includes the scan date", () => {
    const prompt = buildSynthesisUserPrompt([], "2026-02-26");
    expect(prompt).toContain("2026-02-26");
  });

  it("includes repo names", () => {
    const repos = [makeRepo({ fullName: "Peleke/openclaw" })];
    const prompt = buildSynthesisUserPrompt(repos, "2026-02-26");
    expect(prompt).toContain("Peleke/openclaw");
  });

  it("includes merged PRs", () => {
    const repos = [
      makeRepo({
        mergedPRs: [{ number: 42, title: "Add feature X", url: "https://github.com/x/42" }],
      }),
    ];
    const prompt = buildSynthesisUserPrompt(repos, "2026-02-26");
    expect(prompt).toContain("#42");
    expect(prompt).toContain("Add feature X");
    expect(prompt).toContain("Merged PRs");
  });

  it("includes open PRs", () => {
    const repos = [
      makeRepo({
        openPRs: [{ number: 7, title: "WIP: Refactor", url: "https://github.com/x/7" }],
      }),
    ];
    const prompt = buildSynthesisUserPrompt(repos, "2026-02-26");
    expect(prompt).toContain("#7");
    expect(prompt).toContain("Open PRs");
  });

  it("includes buildlog entries", () => {
    const repos = [
      makeRepo({
        buildlogEntries: [{ name: "2026-02-26.md", content: "Shipped the overlay fix" }],
      }),
    ];
    const prompt = buildSynthesisUserPrompt(repos, "2026-02-26");
    expect(prompt).toContain("Buildlog Entries");
    expect(prompt).toContain("Shipped the overlay fix");
  });

  it("handles multiple repos", () => {
    const repos = [
      makeRepo({ fullName: "Peleke/openclaw" }),
      makeRepo({ fullName: "Peleke/linwheel" }),
    ];
    const prompt = buildSynthesisUserPrompt(repos, "2026-02-26");
    expect(prompt).toContain("Peleke/openclaw");
    expect(prompt).toContain("Peleke/linwheel");
  });

  it("handles empty repos array", () => {
    const prompt = buildSynthesisUserPrompt([], "2026-02-26");
    expect(prompt).toContain("2026-02-26");
    expect(prompt).toContain("Synthesize");
  });
});

describe("parseSynthesisResponse", () => {
  it("returns trimmed response for valid markdown", () => {
    const input =
      "  # Today I shipped a major feature\n\nIt was great. Lots of progress across repos.  ";
    const result = parseSynthesisResponse(input);
    expect(result).toBe(
      "# Today I shipped a major feature\n\nIt was great. Lots of progress across repos.",
    );
  });

  it("returns null for too-short responses", () => {
    expect(parseSynthesisResponse("")).toBeNull();
    expect(parseSynthesisResponse("Short.")).toBeNull();
    expect(parseSynthesisResponse("a".repeat(49))).toBeNull();
  });

  it("accepts responses at exactly 50 chars", () => {
    const input = "a".repeat(50);
    expect(parseSynthesisResponse(input)).toBe(input);
  });

  it("strips markdown code fences", () => {
    const input =
      "```markdown\n# My synthesis\n\nContent here that is long enough to pass the check.\n```";
    const result = parseSynthesisResponse(input);
    expect(result).not.toContain("```");
    expect(result).toContain("# My synthesis");
  });

  it("strips md code fences", () => {
    const input =
      "```md\n# Synthesis\n\nLong enough content for the minimum length requirement here.\n```";
    const result = parseSynthesisResponse(input);
    expect(result).not.toContain("```");
  });

  it("strips bare code fences", () => {
    const input =
      "```\n# Synthesis output\n\nLong enough content to pass the minimum length check here.\n```";
    const result = parseSynthesisResponse(input);
    expect(result).not.toContain("```");
  });

  it("preserves internal code blocks", () => {
    const input =
      "# Synthesis\n\nHere is some code:\n\n```typescript\nconst x = 1;\n```\n\nAnd more text to make it long enough.";
    const result = parseSynthesisResponse(input);
    expect(result).toContain("```typescript");
  });
});
