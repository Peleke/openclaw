import { Type } from "@sinclair/typebox";
import type { LinWheel } from "@linwheel/sdk";
import { jsonResult, readStringParam } from "../../../../src/agents/tools/common.js";

export function createPostScheduleTool(client: LinWheel) {
  return {
    name: "linwheel_post_schedule",
    description:
      "Set or clear the scheduled publish time for a post. Pass an ISO 8601 datetime to schedule, or empty string to unschedule.",
    parameters: Type.Object({
      postId: Type.String({ description: "The post ID" }),
      scheduledAt: Type.String({ description: "ISO 8601 datetime, or empty string to unschedule" }),
      autoPublish: Type.Optional(Type.Boolean({ description: "Toggle auto-publish" })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const postId = readStringParam(params, "postId", { required: true });
      const raw = readStringParam(params, "scheduledAt", { required: true, allowEmpty: true });
      const scheduledAt = raw || null;
      const result = await client.posts.schedule(postId, {
        scheduledAt,
        autoPublish: typeof params.autoPublish === "boolean" ? params.autoPublish : undefined,
      });
      return jsonResult(result);
    },
  };
}
