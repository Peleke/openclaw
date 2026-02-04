import { z } from "zod";

export const GreenSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultGridCarbon: z.number().positive().optional(),
    showInStatus: z.boolean().optional(),
    dailyAlertThreshold: z.number().positive().nullable().optional(),
  })
  .strict()
  .optional();
