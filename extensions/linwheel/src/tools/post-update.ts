import { Type } from "@sinclair/typebox";
import type { LinWheel } from "@linwheel/sdk";
import { jsonResult, readStringParam } from "../../../../src/agents/tools/common.js";

export function createPostUpdateTool(client: LinWheel) {
  return {
    name: "linwheel_post_update",
    description: "Update a post's text, hook, or autoPublish setting.",
    parameters: Type.Object({
      postId: Type.String({ description: "The post ID to update" }),
      fullText: Type.Optional(Type.String({ description: "New post text" })),
      hook: Type.Optional(Type.String({ description: "New hook line" })),
      autoPublish: Type.Optional(Type.Boolean({ description: "Toggle auto-publish" })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const postId = readStringParam(params, "postId", { required: true });
      const result = await client.posts.update(postId, {
        fullText: readStringParam(params, "fullText"),
        hook: readStringParam(params, "hook"),
        autoPublish: typeof params.autoPublish === "boolean" ? params.autoPublish : undefined,
      });
      return jsonResult(result);
    },
  };
}
