import { describe, it, expect } from "vitest";
import { formatLearningStatusFromApi, type LearningStatusApiData } from "./cli-status.js";

function makeApiData(overrides?: Partial<LearningStatusApiData>): LearningStatusApiData {
  return {
    summary: {
      traceCount: 20,
      armCount: 5,
      minTimestamp: Date.now() - 86400000,
      maxTimestamp: Date.now(),
      totalTokens: 100000,
      baseline: {
        baselineRuns: 5,
        selectedRuns: 15,
        baselineAvgTokens: 6000,
        selectedAvgTokens: 4500,
        tokenSavingsPercent: 25.0,
        baselineAvgDuration: null,
        selectedAvgDuration: null,
      },
      ...overrides?.summary,
    },
    config: {
      phase: "active",
      tokenBudget: 8000,
      baselineRate: 0.1,
      minPulls: 5,
      ...overrides?.config,
    },
    posteriors: overrides?.posteriors ?? [
      {
        armId: "tool:exec:bash",
        alpha: 15,
        beta: 3,
        pulls: 17,
        lastUpdated: Date.now(),
        mean: 0.833,
      },
      {
        armId: "tool:fs:Read",
        alpha: 12,
        beta: 2,
        pulls: 13,
        lastUpdated: Date.now(),
        mean: 0.857,
      },
      {
        armId: "tool:fs:Write",
        alpha: 8,
        beta: 4,
        pulls: 11,
        lastUpdated: Date.now(),
        mean: 0.667,
      },
      {
        armId: "tool:search:Grep",
        alpha: 6,
        beta: 6,
        pulls: 11,
        lastUpdated: Date.now(),
        mean: 0.5,
      },
      { armId: "tool:exec:curl", alpha: 2, beta: 8, pulls: 9, lastUpdated: Date.now(), mean: 0.2 },
    ],
  };
}

describe("formatLearningStatusFromApi", () => {
  it("renders status from API data", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Learning Layer Status");
    expect(output).toContain("[ACTIVE]");
  });

  it("shows PASSIVE badge when phase is passive", () => {
    const output = formatLearningStatusFromApi(makeApiData({ config: { phase: "passive" } }));
    expect(output).toContain("[PASSIVE]");
    expect(output).not.toContain("[ACTIVE]");
  });

  it("shows config info from API data", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Budget: 8,000");
    expect(output).toContain("Baseline: 10%");
    expect(output).toContain("Min pulls: 5");
  });

  it("shows custom config values", () => {
    const output = formatLearningStatusFromApi(
      makeApiData({
        config: { phase: "active", tokenBudget: 4000, baselineRate: 0.2, minPulls: 10 },
      }),
    );
    expect(output).toContain("Budget: 4,000");
    expect(output).toContain("Baseline: 20%");
    expect(output).toContain("Min pulls: 10");
  });

  it("shows observation count and arm count", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("20");
    expect(output).toContain("5");
    expect(output).toContain("100,000");
  });

  it("shows run distribution with baseline/selected counts", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Run Distribution");
    expect(output).toContain("Baseline:");
    expect(output).toContain("Selected:");
  });

  it("shows token savings percentage from baseline comparison", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Token Savings:");
    expect(output).toContain("25.0%");
  });

  it("handles null tokenSavingsPercent gracefully", () => {
    const data = makeApiData();
    data.summary.baseline.tokenSavingsPercent = null;
    const output = formatLearningStatusFromApi(data);
    expect(output).toContain("Run Distribution");
    expect(output).not.toContain("Token Savings:");
  });

  it("shows top arms table when posteriors are present", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Top Arms");
    expect(output).toContain("tool:exec:bash");
    expect(output).toContain("Arm");
    expect(output).toContain("Mean");
    expect(output).toContain("Pulls");
  });

  it("shows empty state for zero observations", () => {
    const data = makeApiData();
    data.summary.traceCount = 0;
    const output = formatLearningStatusFromApi(data);
    expect(output).toContain("No observations recorded yet");
  });

  it("shows bottom arms when more than 5 posteriors", () => {
    const posteriors = Array.from({ length: 8 }, (_, i) => ({
      armId: `tool:cat:arm${i}`,
      alpha: 10 - i,
      beta: i + 1,
      pulls: 10,
      lastUpdated: Date.now(),
      mean: (10 - i) / (10 - i + i + 1),
    }));
    const output = formatLearningStatusFromApi(makeApiData({ posteriors }));
    expect(output).toContain("Top Arms");
    expect(output).toContain("Bottom Arms");
  });

  it("does not show bottom arms when 5 or fewer posteriors", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Top Arms");
    expect(output).not.toContain("Bottom Arms");
  });

  it("handles no config values gracefully", () => {
    const output = formatLearningStatusFromApi(
      makeApiData({
        config: {
          phase: "passive",
          tokenBudget: undefined,
          baselineRate: undefined,
          minPulls: undefined,
        },
      }),
    );
    expect(output).toContain("[PASSIVE]");
    expect(output).not.toContain("Budget:");
  });

  it("handles empty posteriors array", () => {
    const output = formatLearningStatusFromApi(makeApiData({ posteriors: [] }));
    expect(output).toContain("No arm posteriors yet.");
  });

  it("shows baseline avg and selected avg in savings line", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("baseline avg: 6000");
    expect(output).toContain("selected avg: 4500");
  });

  it("shows negative savings when selected uses more tokens", () => {
    const data = makeApiData();
    data.summary.baseline.tokenSavingsPercent = -15.0;
    data.summary.baseline.baselineAvgTokens = 4000;
    data.summary.baseline.selectedAvgTokens = 4600;
    const output = formatLearningStatusFromApi(data);
    expect(output).toContain("-15.0%");
  });
});
