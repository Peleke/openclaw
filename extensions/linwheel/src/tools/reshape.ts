import { Type } from "@sinclair/typebox";
import type { LinWheel, PostAngle } from "@linwheel/sdk";
import { stringEnum } from "../../../../src/agents/schema/typebox.js";
import { jsonResult, readStringParam, readStringArrayParam } from "../../../../src/agents/tools/common.js";

const POST_ANGLES = [
  "contrarian",
  "field_note",
  "demystification",
  "identity_validation",
  "provocateur",
  "synthesizer",
  "curious_cat",
] as const;

export function createReshapeTool(client: LinWheel) {
  return {
    name: "linwheel_reshape",
    description:
      "Decompose source content into multiple angle-specific LinkedIn posts. Each angle produces a distinct post with the author's voice preserved. Set saveDrafts=true to persist all generated posts.",
    parameters: Type.Object({
      text: Type.String({ description: "The source content to reshape into LinkedIn posts" }),
      angles: Type.Array(
        stringEnum(POST_ANGLES, { description: "Post angle" }),
        { description: "Which angles to reshape into" },
      ),
      preEdit: Type.Optional(Type.Boolean({ description: "Light-edit input before reshaping (default: false)" })),
      instructions: Type.Optional(Type.String({ description: "Tone, audience, or style instructions" })),
      saveDrafts: Type.Optional(Type.Boolean({ description: "Save as drafts in LinWheel (recommended: true)" })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const text = readStringParam(params, "text", { required: true });
      const angles = readStringArrayParam(params, "angles", { required: true }) as PostAngle[];
      const result = await client.reshape({
        text,
        angles,
        preEdit: typeof params.preEdit === "boolean" ? params.preEdit : undefined,
        instructions: readStringParam(params, "instructions"),
        saveDrafts: typeof params.saveDrafts === "boolean" ? params.saveDrafts : undefined,
      });
      return jsonResult(result);
    },
  };
}
