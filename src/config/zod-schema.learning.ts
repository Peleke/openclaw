import { z } from "zod";

export const LearningSchema = z
  .object({
    enabled: z.boolean().optional(),
    phase: z.enum(["passive", "active"]).optional(),
    tokenBudget: z.number().int().positive().optional(),
    baselineRate: z.number().min(0).max(1).optional(),
    minPulls: z.number().int().nonnegative().optional(),
    qortex: z
      .object({
        command: z.string().optional(),
        transport: z.enum(["stdio", "http"]).optional(),
        http: z
          .object({
            baseUrl: z.string(),
            headers: z.record(z.string(), z.string()).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    learnerName: z.string().optional(),
  })
  .strict()
  .optional();
