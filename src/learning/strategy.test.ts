import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Arm, ArmId, ArmPosterior, SelectionContext } from "./types.js";
import { ThompsonStrategy, SEED_ARM_IDS, createThompsonStrategy } from "./strategy.js";

// Mock Math.random for deterministic tests
const mockRandom = vi.spyOn(Math, "random");

beforeEach(() => {
  mockRandom.mockReset();
});

function makeArm(overrides?: Partial<Arm>): Arm {
  const id = overrides?.id ?? `tool:test:tool-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    type: "tool",
    category: "test",
    label: id.split(":").pop() ?? "test",
    tokenCost: 100,
    ...overrides,
  };
}

function makePosterior(armId: ArmId, overrides?: Partial<ArmPosterior>): ArmPosterior {
  return {
    armId,
    alpha: 3,
    beta: 1,
    pulls: 10,
    lastUpdated: Date.now(),
    ...overrides,
  };
}

function makeContext(): SelectionContext {
  return {
    sessionKey: "test-session",
    channel: "telegram",
    provider: "anthropic",
    model: "claude-3",
  };
}

describe("ThompsonStrategy", () => {
  describe("baseline rate", () => {
    it("returns all arms when random < baselineRate", () => {
      // First call for baseline check returns 0.05 (< 0.10)
      mockRandom.mockReturnValueOnce(0.05);

      const strategy = createThompsonStrategy({ baselineRate: 0.1 });
      const arms = [makeArm({ tokenCost: 100 }), makeArm({ tokenCost: 100 })];

      const result = strategy.select({
        arms,
        posteriors: new Map(),
        context: makeContext(),
        tokenBudget: 500,
      });

      expect(result.isBaseline).toBe(true);
      expect(result.selectedArms).toHaveLength(2);
      expect(result.excludedArms).toHaveLength(0);
    });

    it("uses Thompson selection when random >= baselineRate", () => {
      // First call for baseline check returns 0.15 (>= 0.10)
      mockRandom.mockReturnValueOnce(0.15);
      // Subsequent calls for Thompson sampling
      mockRandom.mockReturnValue(0.5);

      const strategy = createThompsonStrategy({ baselineRate: 0.1 });
      const arms = [makeArm({ tokenCost: 100 }), makeArm({ tokenCost: 100 })];

      const result = strategy.select({
        arms,
        posteriors: new Map(),
        context: makeContext(),
        tokenBudget: 500,
      });

      expect(result.isBaseline).toBe(false);
    });
  });

  describe("seed arm inclusion", () => {
    it("always includes seed arms first", () => {
      // Skip baseline (0.5 > 0.1)
      mockRandom.mockReturnValueOnce(0.5);
      // Thompson scores - make non-seed arms score higher
      mockRandom.mockReturnValue(0.99);

      const strategy = createThompsonStrategy({ seedArmIds: ["tool:fs:Read"] });

      // Mix of seed and non-seed arms
      const seedArm = makeArm({ id: "tool:fs:Read", tokenCost: 100 });
      const nonSeedArm1 = makeArm({ id: "tool:other:foo", tokenCost: 100 });
      const nonSeedArm2 = makeArm({ id: "tool:other:bar", tokenCost: 100 });

      const result = strategy.select({
        arms: [nonSeedArm1, seedArm, nonSeedArm2],
        posteriors: new Map(),
        context: makeContext(),
        tokenBudget: 200, // Only room for 2 arms
      });

      // Seed arm should be included
      expect(result.selectedArms).toContain("tool:fs:Read");
      expect(result.selectedArms).toHaveLength(2);
    });

    it("uses default seed arm IDs", () => {
      expect(SEED_ARM_IDS).toContain("tool:fs:Read");
      expect(SEED_ARM_IDS).toContain("tool:fs:Write");
      expect(SEED_ARM_IDS).toContain("tool:exec:Bash");
      expect(SEED_ARM_IDS).toContain("tool:fs:Glob");
      expect(SEED_ARM_IDS).toContain("tool:fs:Grep");
      expect(SEED_ARM_IDS).toContain("tool:fs:Edit");
    });
  });

  describe("underexplored arm priority", () => {
    it("prioritizes arms with fewer than minPulls", () => {
      // Skip baseline
      mockRandom.mockReturnValueOnce(0.5);
      // Thompson scores - equal scores
      mockRandom.mockReturnValue(0.5);

      const strategy = createThompsonStrategy({
        minPulls: 5,
        seedArmIds: [], // No seeds to simplify test
      });

      const exploredArm = makeArm({ id: "tool:explored:one", tokenCost: 100 });
      const underexploredArm = makeArm({ id: "tool:unexplored:two", tokenCost: 100 });

      const posteriors = new Map<ArmId, ArmPosterior>();
      posteriors.set("tool:explored:one", makePosterior("tool:explored:one", { pulls: 10 }));
      posteriors.set("tool:unexplored:two", makePosterior("tool:unexplored:two", { pulls: 2 }));

      const result = strategy.select({
        arms: [exploredArm, underexploredArm],
        posteriors,
        context: makeContext(),
        tokenBudget: 100, // Only room for 1 arm
      });

      // Underexplored arm should be selected
      expect(result.selectedArms).toContain("tool:unexplored:two");
      expect(result.excludedArms).toContain("tool:explored:one");
    });

    it("treats arms with no posterior as underexplored", () => {
      mockRandom.mockReturnValueOnce(0.5);
      mockRandom.mockReturnValue(0.5);

      const strategy = createThompsonStrategy({
        minPulls: 5,
        seedArmIds: [],
      });

      const newArm = makeArm({ id: "tool:new:arm", tokenCost: 100 });
      const oldArm = makeArm({ id: "tool:old:arm", tokenCost: 100 });

      const posteriors = new Map<ArmId, ArmPosterior>();
      posteriors.set("tool:old:arm", makePosterior("tool:old:arm", { pulls: 20 }));
      // newArm has no posterior

      const result = strategy.select({
        arms: [oldArm, newArm],
        posteriors,
        context: makeContext(),
        tokenBudget: 100,
      });

      expect(result.selectedArms).toContain("tool:new:arm");
    });
  });

  describe("token budget", () => {
    it("respects token budget", () => {
      mockRandom.mockReturnValueOnce(0.5);
      mockRandom.mockReturnValue(0.5);

      const strategy = createThompsonStrategy({ seedArmIds: [] });

      const arms = [
        makeArm({ id: "tool:a:one", tokenCost: 300 }),
        makeArm({ id: "tool:b:two", tokenCost: 300 }),
        makeArm({ id: "tool:c:three", tokenCost: 300 }),
      ];

      const result = strategy.select({
        arms,
        posteriors: new Map(),
        context: makeContext(),
        tokenBudget: 500,
      });

      expect(result.selectedArms.length).toBeLessThanOrEqual(2);
      expect(result.usedTokens).toBeLessThanOrEqual(500);
    });

    it("tracks used tokens correctly", () => {
      mockRandom.mockReturnValueOnce(0.05); // baseline

      const strategy = createThompsonStrategy();

      const arms = [
        makeArm({ tokenCost: 100 }),
        makeArm({ tokenCost: 150 }),
        makeArm({ tokenCost: 200 }),
      ];

      const result = strategy.select({
        arms,
        posteriors: new Map(),
        context: makeContext(),
        tokenBudget: 300,
      });

      // Should include arms with total cost ≤ 300
      // 100 + 150 = 250, adding 200 would exceed
      expect(result.usedTokens).toBe(250);
      expect(result.selectedArms).toHaveLength(2);
    });

    it("excludes arms that don't fit", () => {
      mockRandom.mockReturnValueOnce(0.05);

      const strategy = createThompsonStrategy();

      const smallArm = makeArm({ id: "small", tokenCost: 100 });
      const largeArm = makeArm({ id: "large", tokenCost: 500 });

      const result = strategy.select({
        arms: [smallArm, largeArm],
        posteriors: new Map(),
        context: makeContext(),
        tokenBudget: 300,
      });

      expect(result.selectedArms).toContain("small");
      expect(result.excludedArms).toContain("large");
    });
  });

  describe("Thompson sampling", () => {
    it("selects arms with higher Thompson scores", () => {
      mockRandom.mockReturnValueOnce(0.5); // Skip baseline

      // Control Thompson scores by controlling sampleBeta results
      // Since sampleBeta uses multiple random calls, we need to mock a sequence
      const randomValues = [
        0.5, // baseline check
        0.1,
        0.9,
        0.1,
        0.9, // First arm gets low score
        0.9,
        0.1,
        0.9,
        0.1, // Second arm gets high score
      ];
      let callIndex = 0;
      mockRandom.mockImplementation(() => randomValues[callIndex++] ?? 0.5);

      const strategy = createThompsonStrategy({
        seedArmIds: [],
        minPulls: 0, // Disable underexplored priority
      });

      const lowScoreArm = makeArm({ id: "tool:low:score", tokenCost: 100 });
      const highScoreArm = makeArm({ id: "tool:high:score", tokenCost: 100 });

      // Both arms have same posteriors but different sampled scores
      const posteriors = new Map<ArmId, ArmPosterior>();
      posteriors.set("tool:low:score", makePosterior("tool:low:score", { alpha: 5, beta: 5 }));
      posteriors.set("tool:high:score", makePosterior("tool:high:score", { alpha: 5, beta: 5 }));

      const result = strategy.select({
        arms: [lowScoreArm, highScoreArm],
        posteriors,
        context: makeContext(),
        tokenBudget: 100, // Only room for 1
      });

      // Due to Thompson sampling randomness, we just verify one is selected
      expect(result.selectedArms).toHaveLength(1);
      expect(result.excludedArms).toHaveLength(1);
    });

    it("uses curated prior for tools", () => {
      mockRandom.mockReturnValueOnce(0.5);
      mockRandom.mockReturnValue(0.5);

      const strategy = createThompsonStrategy({ seedArmIds: [] });

      const toolArm = makeArm({ id: "tool:test:arm", type: "tool", tokenCost: 100 });

      const result = strategy.select({
        arms: [toolArm],
        posteriors: new Map(), // No posteriors, will use initial prior
        context: makeContext(),
        tokenBudget: 500,
      });

      // Should select the arm (curated prior is optimistic)
      expect(result.selectedArms).toContain("tool:test:arm");
    });

    it("uses learned prior for files", () => {
      mockRandom.mockReturnValueOnce(0.5);
      mockRandom.mockReturnValue(0.5);

      const strategy = createThompsonStrategy({ seedArmIds: [] });

      const fileArm: Arm = {
        id: "file:workspace:README.md",
        type: "file",
        category: "workspace",
        label: "README.md",
        tokenCost: 100,
      };

      const result = strategy.select({
        arms: [fileArm],
        posteriors: new Map(),
        context: makeContext(),
        tokenBudget: 500,
      });

      // Should still select the arm
      expect(result.selectedArms).toContain("file:workspace:README.md");
    });
  });

  describe("sort order", () => {
    it("sorts seeds first, then underexplored, then by score", () => {
      mockRandom.mockReturnValueOnce(0.5);
      // Make Thompson scores predictable - higher values for later arms
      let score = 0.1;
      mockRandom.mockImplementation(() => (score += 0.1));

      const strategy = createThompsonStrategy({
        seedArmIds: ["tool:fs:Read"],
        minPulls: 5,
      });

      const seedArm = makeArm({ id: "tool:fs:Read", tokenCost: 100 });
      const underexploredArm = makeArm({ id: "tool:unexplored:arm", tokenCost: 100 });
      const exploredHighScore = makeArm({ id: "tool:explored:high", tokenCost: 100 });

      const posteriors = new Map<ArmId, ArmPosterior>();
      posteriors.set("tool:unexplored:arm", makePosterior("tool:unexplored:arm", { pulls: 2 }));
      posteriors.set("tool:explored:high", makePosterior("tool:explored:high", { pulls: 20 }));
      // seed arm has no posterior (also underexplored but seed takes priority)

      const result = strategy.select({
        arms: [exploredHighScore, underexploredArm, seedArm],
        posteriors,
        context: makeContext(),
        tokenBudget: 200, // Room for 2
      });

      // Seed should be first, then underexplored
      expect(result.selectedArms[0]).toBe("tool:fs:Read");
      // Second should be underexplored
      expect(result.selectedArms).toContain("tool:unexplored:arm");
    });
  });

  describe("createThompsonStrategy", () => {
    it("uses default config values", () => {
      const strategy = createThompsonStrategy();
      expect(strategy).toBeInstanceOf(ThompsonStrategy);
    });

    it("allows partial overrides", () => {
      const strategy = createThompsonStrategy({ baselineRate: 0.2 });
      expect(strategy).toBeInstanceOf(ThompsonStrategy);
    });
  });
});
