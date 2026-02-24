import { Type } from "@sinclair/typebox";
import type { LinWheel, RefineIntensity } from "@linwheel/sdk";
import { optionalStringEnum } from "../../../../src/agents/schema/typebox.js";
import { jsonResult, readStringParam } from "../../../../src/agents/tools/common.js";

const REFINE_INTENSITIES = ["light", "medium", "heavy"] as const;

export function createRefineTool(client: LinWheel) {
  return {
    name: "linwheel_refine",
    description:
      "Run an LLM editing pass on text. Light = grammar only. Medium = grammar + LinkedIn formatting. Heavy = full rewrite.",
    parameters: Type.Object({
      text: Type.String({ description: "The text to refine" }),
      intensity: optionalStringEnum(REFINE_INTENSITIES, { description: "Editing intensity (default: medium)" }),
      instructions: Type.Optional(Type.String({ description: "Custom editing instructions" })),
      postType: Type.Optional(Type.String({ description: "Target angle for tone guidance" })),
      saveDraft: Type.Optional(Type.Boolean({ description: "Save refined text as a new draft (default: false)" })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const text = readStringParam(params, "text", { required: true });
      const result = await client.refine({
        text,
        intensity: (params.intensity as RefineIntensity) ?? undefined,
        instructions: readStringParam(params, "instructions"),
        postType: readStringParam(params, "postType"),
        saveDraft: typeof params.saveDraft === "boolean" ? params.saveDraft : undefined,
      });
      return jsonResult(result);
    },
  };
}
