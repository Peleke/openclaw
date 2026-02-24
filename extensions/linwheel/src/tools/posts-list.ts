import { Type } from "@sinclair/typebox";
import type { LinWheel } from "@linwheel/sdk";
import { jsonResult, readStringParam, readNumberParam } from "../../../../src/agents/tools/common.js";

export function createPostsListTool(client: LinWheel) {
  return {
    name: "linwheel_posts_list",
    description:
      "List LinkedIn post drafts with optional filters. Returns post IDs, text previews, approval status, and schedule info.",
    parameters: Type.Object({
      approved: Type.Optional(Type.Boolean({ description: "Filter by approval status" })),
      scheduled: Type.Optional(Type.Boolean({ description: "Filter by has scheduled time" })),
      published: Type.Optional(Type.Boolean({ description: "Filter by published to LinkedIn" })),
      type: Type.Optional(Type.String({ description: "Filter by post angle (e.g. field_note)" })),
      limit: Type.Optional(Type.Number({ description: "Max results (default 50, max 100)" })),
      offset: Type.Optional(Type.Number({ description: "Pagination offset" })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const result = await client.posts.list({
        approved: typeof params.approved === "boolean" ? params.approved : undefined,
        scheduled: typeof params.scheduled === "boolean" ? params.scheduled : undefined,
        published: typeof params.published === "boolean" ? params.published : undefined,
        type: readStringParam(params, "type"),
        limit: readNumberParam(params, "limit", { integer: true }),
        offset: readNumberParam(params, "offset", { integer: true }),
      });
      return jsonResult(result);
    },
  };
}
