import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseRunletSummary, parseTaskCompletion, findForcedDecisions } from "../parser.js";

const fixturesDir = path.join(import.meta.dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), "utf-8");
}

describe("parseRunletSummary", () => {
  it("extracts RUNLET_SUMMARY JSON from full runlist", () => {
    const content = readFixture("runlist-full.md");
    const summary = parseRunletSummary(content);

    expect(summary).not.toBeNull();
    expect(summary!.date).toBe("2026-03-13");
    expect(summary!.focus).toBe("Money");
    expect(summary!.counts.do_first).toBe(3);
    expect(summary!.counts.block_time).toBe(2);
    expect(summary!.counts.batch).toBe(2);
    expect(summary!.counts.kill).toBe(2);
    expect(summary!.top_task).toBe("LinkedIn outreach: 5 new conversations");
    expect(summary!.tasks).toHaveLength(9);
  });

  it("returns null when no RUNLET_SUMMARY exists", () => {
    const content = readFixture("runlist-no-summary.md");
    const summary = parseRunletSummary(content);
    expect(summary).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const content = "<!-- RUNLET_SUMMARY\n{invalid json}\n-->";
    expect(parseRunletSummary(content)).toBeNull();
  });

  it("parses carried items", () => {
    const content = readFixture("runlist-3-carry.md");
    const summary = parseRunletSummary(content);

    expect(summary!.carried).toEqual(["Atlanta meetup search"]);
    expect(summary!.carried_count).toBe(1);
  });
});

describe("parseTaskCompletion", () => {
  it("counts all tasks as pending in fresh runlist", () => {
    const content = readFixture("runlist-full.md");
    const completion = parseTaskCompletion(content);

    expect(completion.done).toHaveLength(0);
    expect(completion.pending).toHaveLength(7); // 3 do first + 2 block time + 2 batch
  });

  it("correctly splits done and pending", () => {
    const content = readFixture("runlist-partial.md");
    const completion = parseTaskCompletion(content);

    expect(completion.done).toHaveLength(4); // LinkedIn, Reply, Discord, Dev.to
    expect(completion.pending).toHaveLength(3); // Follow up, Atlanta, LinWheel
  });

  it("skips entry point lines", () => {
    const content = readFixture("runlist-full.md");
    const completion = parseTaskCompletion(content);

    const allTasks = [...completion.done, ...completion.pending];
    const entryPoints = allTasks.filter((t) => t.includes("Entry point"));
    expect(entryPoints).toHaveLength(0);
  });

  it("skips killed (strikethrough) items", () => {
    const content = readFixture("runlist-full.md");
    const completion = parseTaskCompletion(content);

    const allTasks = [...completion.done, ...completion.pending];
    const killed = allTasks.filter((t) => t.includes("Rhythm") || t.includes("carousel"));
    expect(killed).toHaveLength(0);
  });
});

describe("findForcedDecisions", () => {
  it("finds tasks in kill quadrant with carried_from", () => {
    const content = readFixture("runlist-3-carry.md");
    const summary = parseRunletSummary(content)!;
    const forced = findForcedDecisions(summary.tasks);

    expect(forced).toHaveLength(1);
    expect(forced[0].description).toBe("Atlanta meetup search");
    expect(forced[0].carried_from).toBe("2026-03-13");
  });

  it("returns empty for fresh runlist with no carries", () => {
    const content = readFixture("runlist-full.md");
    const summary = parseRunletSummary(content)!;
    const forced = findForcedDecisions(summary.tasks);

    expect(forced).toHaveLength(0);
  });
});
