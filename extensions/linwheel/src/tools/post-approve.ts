import { Type } from "@sinclair/typebox";
import type { LinWheel } from "@linwheel/sdk";
import { jsonResult, readStringParam } from "../../../../src/agents/tools/common.js";

export function createPostApproveTool(client: LinWheel) {
  return {
    name: "linwheel_post_approve",
    description:
      "Approve or unapprove a post. Approved posts with autoPublish=true auto-publish at their scheduled time.",
    parameters: Type.Object({
      postId: Type.String({ description: "The post ID" }),
      approved: Type.Boolean({ description: "true to approve, false to unapprove" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const postId = readStringParam(params, "postId", { required: true });
      if (typeof params.approved !== "boolean") throw new Error("approved required");
      const result = await client.posts.approve(postId, params.approved);
      return jsonResult(result);
    },
  };
}
