import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatMorningPing, formatNightlyRecap } from "../formatter.js";
import { parseRunletSummary, parseTaskCompletion, findForcedDecisions } from "../parser.js";

const fixturesDir = path.join(import.meta.dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), "utf-8");
}

describe("formatMorningPing", () => {
  it("formats a standard morning message", () => {
    const content = readFixture("runlist-full.md");
    const summary = parseRunletSummary(content)!;
    const message = formatMorningPing(summary);

    expect(message).toContain("Morning.");
    expect(message).toContain("3 Do First");
    expect(message).toContain("2 Block Time");
    expect(message).toContain("2 Batch");
    expect(message).toContain("Focus: Money");
    expect(message).toContain("Top: LinkedIn outreach");
  });

  it("includes carried items when present", () => {
    const content = readFixture("runlist-3-carry.md");
    const summary = parseRunletSummary(content)!;
    const message = formatMorningPing(summary);

    expect(message).toContain("Carried from yesterday: Atlanta meetup search");
  });

  it("omits carried line when no carries", () => {
    const content = readFixture("runlist-full.md");
    const summary = parseRunletSummary(content)!;
    const message = formatMorningPing(summary);

    expect(message).not.toContain("Carried from yesterday");
  });

  it("contains no emoji", () => {
    const content = readFixture("runlist-full.md");
    const summary = parseRunletSummary(content)!;
    const message = formatMorningPing(summary);

    // Check for common emoji ranges
    expect(message).not.toMatch(/[\u{1F600}-\u{1F64F}]/u);
    expect(message).not.toMatch(/[\u{1F300}-\u{1F5FF}]/u);
    expect(message).not.toMatch(/[\u{1F680}-\u{1F6FF}]/u);
  });

  it("handles empty runlist", () => {
    const summary = {
      date: "2026-03-13",
      focus: "Money",
      known_focuses: ["Money"],
      counts: { do_first: 0, block_time: 0, batch: 0, kill: 0 },
      top_task: "",
      carried: [],
      carried_count: 0,
      tasks: [],
    };
    const message = formatMorningPing(summary);

    expect(message).toContain("Nothing on the list");
  });
});

describe("formatNightlyRecap", () => {
  it("formats completion rate", () => {
    const content = readFixture("runlist-partial.md");
    const summary = parseRunletSummary(content)!;
    const completion = parseTaskCompletion(content);
    const forced = findForcedDecisions(summary.tasks);
    const message = formatNightlyRecap(summary, completion, forced);

    expect(message).toContain("Nightly.");
    expect(message).toContain("4/7 done.");
  });

  it("lists unchecked items", () => {
    const content = readFixture("runlist-partial.md");
    const summary = parseRunletSummary(content)!;
    const completion = parseTaskCompletion(content);
    const forced = findForcedDecisions(summary.tasks);
    const message = formatNightlyRecap(summary, completion, forced);

    expect(message).toContain("Unchecked:");
    expect(message).toContain("Atlanta meetup");
  });

  it("includes forced decision warnings", () => {
    const content = readFixture("runlist-3-carry.md");
    const summary = parseRunletSummary(content)!;
    const completion = parseTaskCompletion(content);
    const forced = findForcedDecisions(summary.tasks);
    const message = formatNightlyRecap(summary, completion, forced);

    expect(message).toContain("carried 3x");
    expect(message).toContain("block time tomorrow or kill it");
  });

  it("handles all-done scenario", () => {
    const summary = {
      date: "2026-03-13",
      focus: "Money",
      known_focuses: ["Money"],
      counts: { do_first: 3, block_time: 0, batch: 0, kill: 0 },
      top_task: "",
      carried: [],
      carried_count: 0,
      tasks: [],
    };
    const completion = { done: ["a", "b", "c"], pending: [] };
    const message = formatNightlyRecap(summary, completion, []);

    expect(message).toContain("3/3 done.");
    expect(message).not.toContain("Unchecked:");
  });
});
