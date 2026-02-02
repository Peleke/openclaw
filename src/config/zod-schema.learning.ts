import { z } from "zod";

export const LearningSchema = z
  .object({
    enabled: z.boolean().optional(),
    phase: z.enum(["passive", "active"]).optional(),
    strategy: z.enum(["thompson"]).optional(),
    tokenBudget: z.number().int().positive().optional(),
    baselineRate: z.number().min(0).max(1).optional(),
    minPulls: z.number().int().nonnegative().optional(),
    decayHalfLifeDays: z.number().positive().optional(),
  })
  .strict()
  .optional();
