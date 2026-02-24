import { Type } from "@sinclair/typebox";
import type { LinWheel } from "@linwheel/sdk";
import { jsonResult, readStringParam } from "../../../../src/agents/tools/common.js";

export function createPostGetTool(client: LinWheel) {
  return {
    name: "linwheel_post_get",
    description: "Get full details of a single LinkedIn post draft.",
    parameters: Type.Object({
      postId: Type.String({ description: "The post ID to retrieve" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const postId = readStringParam(params, "postId", { required: true });
      const result = await client.posts.get(postId);
      return jsonResult(result);
    },
  };
}
