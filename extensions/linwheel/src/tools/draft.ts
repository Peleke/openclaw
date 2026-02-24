import { Type } from "@sinclair/typebox";
import type { LinWheel } from "@linwheel/sdk";
import { jsonResult, readStringParam } from "../../../../src/agents/tools/common.js";

export function createDraftTool(client: LinWheel) {
  return {
    name: "linwheel_draft",
    description:
      "Create a manual draft post in LinWheel. Use when you have final post text ready. For generating from raw content, use linwheel_reshape instead.",
    parameters: Type.Object({
      fullText: Type.String({ description: "Full post text (max 3000 chars)" }),
      hook: Type.Optional(Type.String({ description: "Opening hook line" })),
      postType: Type.Optional(Type.String({ description: "Content angle (default: field_note)" })),
      approved: Type.Optional(Type.Boolean({ description: "Pre-approve (default: false)" })),
      autoPublish: Type.Optional(Type.Boolean({ description: "Auto-publish at schedule (default: true)" })),
      scheduledAt: Type.Optional(Type.String({ description: "ISO 8601 datetime for scheduled publishing" })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const fullText = readStringParam(params, "fullText", { required: true });
      const result = await client.draft({
        fullText,
        hook: readStringParam(params, "hook"),
        postType: readStringParam(params, "postType"),
        approved: typeof params.approved === "boolean" ? params.approved : undefined,
        autoPublish: typeof params.autoPublish === "boolean" ? params.autoPublish : undefined,
        scheduledAt: readStringParam(params, "scheduledAt"),
      });
      return jsonResult(result);
    },
  };
}
