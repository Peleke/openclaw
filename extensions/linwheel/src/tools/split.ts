import { Type } from "@sinclair/typebox";
import type { LinWheel } from "@linwheel/sdk";
import { jsonResult, readStringParam, readNumberParam } from "../../../../src/agents/tools/common.js";

export function createSplitTool(client: LinWheel) {
  return {
    name: "linwheel_split",
    description:
      "Split long content into a series of standalone LinkedIn posts. Each post works independently but together forms a coherent series.",
    parameters: Type.Object({
      text: Type.String({ description: "The long content to split" }),
      maxPosts: Type.Optional(Type.Number({ description: "Maximum posts in the series (2-10, default: 5)" })),
      instructions: Type.Optional(Type.String({ description: "Instructions for splitting" })),
      saveDrafts: Type.Optional(Type.Boolean({ description: "Save all as drafts (default: false)" })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const text = readStringParam(params, "text", { required: true });
      const result = await client.split({
        text,
        maxPosts: readNumberParam(params, "maxPosts", { integer: true }),
        instructions: readStringParam(params, "instructions"),
        saveDrafts: typeof params.saveDrafts === "boolean" ? params.saveDrafts : undefined,
      });
      return jsonResult(result);
    },
  };
}
