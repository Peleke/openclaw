# Types

All types exported from the Learning module (`src/learning/types.ts`).

## Config

### `LearningConfig`

```typescript
type LearningConfig = {
  enabled?: boolean;
  phase?: "passive" | "active";
  strategy?: "thompson";
  tokenBudget?: number;
  /** Fraction of runs using full prompt (counterfactual). Default 0.10. */
  baselineRate?: number;
  /** Arms with fewer than N pulls are always included. */
  minPulls?: number;
  /** For v0.0.2 temporal decay. */
  decayHalfLifeDays?: number;
};
```

## Arms

### `ArmType`

```typescript
type ArmType = "tool" | "memory" | "skill" | "file" | "section";
```

| Type | Description | Example |
|------|-------------|---------|
| `tool` | Agent tools (Read, Write, Bash, etc.) | `tool:fs:Read` |
| `memory` | Memory entries loaded into context | `memory:project:auth-notes` |
| `skill` | Skill/plugin prompt sections | `skill:coding:main` |
| `file` | Workspace files in context | `file:workspace:src/index.ts` |
| `section` | Structural prompt sections | `section:system:instructions` |

### `ArmId`

```typescript
/** Hierarchical arm identifier: "type:category:id" */
type ArmId = string;
```

Format: `type:category:id` (e.g., `tool:exec:Bash`, `file:workspace:README.md`).

### `Arm`

```typescript
type Arm = {
  id: ArmId;
  type: ArmType;
  category: string;
  label: string;
  /** Estimated tokens this arm consumes in the prompt. */
  tokenCost: number;
};
```

### `ParsedArmId`

```typescript
type ParsedArmId = {
  type: ArmType;
  category: string;
  id: string;
};
```

Returned by `parseArmId()`. Returns `null` if the arm ID is malformed.

## Posteriors

### `ArmPosterior`

```typescript
type ArmPosterior = {
  armId: ArmId;
  /** Beta distribution successes (prior = 1.0). */
  alpha: number;
  /** Beta distribution failures (prior = 1.0). */
  beta: number;
  /** Total times this arm was included in a run. */
  pulls: number;
  lastUpdated: number;
};
```

### `BetaParams`

```typescript
type BetaParams = {
  /** Successes + prior. */
  alpha: number;
  /** Failures + prior. */
  beta: number;
};
```

### `ArmSource`

```typescript
type ArmSource = "curated" | "learned";
```

Determines the initial prior for an arm:

- `"curated"` — Tools, skills, memories: Beta(3, 1), mean = 0.75 (optimistic)
- `"learned"` — Files: Beta(1, 1), mean = 0.50 (neutral)

## Selection

### `SelectionContext`

```typescript
type SelectionContext = {
  sessionKey?: string;
  channel?: string;
  provider?: string;
  model?: string;
  promptLength?: number;
  /** Captured now for future LinUCB (v0.0.2). */
  featureVector?: number[];
};
```

### `SelectionResult`

```typescript
type SelectionResult = {
  selectedArms: ArmId[];
  excludedArms: ArmId[];
  isBaseline: boolean;
  totalTokenBudget: number;
  usedTokens: number;
};
```

### `SelectionStrategy`

```typescript
interface SelectionStrategy {
  select(params: {
    arms: Arm[];
    posteriors: Map<ArmId, ArmPosterior>;
    context: SelectionContext;
    tokenBudget: number;
  }): SelectionResult;
}
```

### `ThompsonConfig`

```typescript
type ThompsonConfig = {
  /** Fraction of runs using full prompt (counterfactual). Default 0.10. */
  baselineRate: number;
  /** Arms with fewer than N pulls are always included. Default 5. */
  minPulls: number;
  /** Core arms that are never excluded. */
  seedArmIds?: ArmId[];
};
```

## Run Traces

### `RunTrace`

```typescript
type RunTrace = {
  traceId: string;
  runId: string;
  sessionId: string;
  sessionKey?: string;
  timestamp: number;
  provider?: string;
  model?: string;
  channel?: string;
  isBaseline: boolean;
  context: SelectionContext;
  arms: ArmOutcome[];
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    total?: number;
  };
  durationMs?: number;
  systemPromptChars: number;
  aborted: boolean;
  error?: string;
};
```

### `ArmOutcome`

```typescript
type ArmOutcome = {
  armId: ArmId;
  included: boolean;
  referenced: boolean;
  tokenCost: number;
};
```

## Storage

### `TraceSummary`

```typescript
type TraceSummary = {
  traceCount: number;
  armCount: number;
  minTimestamp: number | null;
  maxTimestamp: number | null;
  totalTokens: number;
};
```

### `TimeseriesBucket`

```typescript
type TimeseriesBucket = {
  t: number;
  value: number;
  armId?: string;
};
```

### `BaselineComparison`

```typescript
type BaselineComparison = {
  baselineRuns: number;
  selectedRuns: number;
  baselineAvgTokens: number | null;
  selectedAvgTokens: number | null;
  tokenSavingsPercent: number | null;
  baselineAvgDuration: number | null;
  selectedAvgDuration: number | null;
};
```

## API Responses

### `LearningStatusApiData`

```typescript
type LearningStatusApiData = {
  summary: TraceSummary & {
    baseline: BaselineComparison;
  };
  config: {
    enabled?: boolean;
    phase: string;
    strategy?: string;
    tokenBudget?: number;
    baselineRate?: number;
    minPulls?: number;
    seedArmIds?: string[];
  };
  posteriors: Array<{
    armId: string;
    alpha: number;
    beta: number;
    pulls: number;
    lastUpdated: number;
    mean: number;
  }>;
};
```

## Utility Functions

### `parseArmId(armId: string): ParsedArmId | null`

Parse `"type:category:id"` into components. Returns `null` if malformed.

### `buildArmId(type: ArmType, category: string, id: string): ArmId`

Build an arm ID from components: `` `${type}:${category}:${id}` ``.
