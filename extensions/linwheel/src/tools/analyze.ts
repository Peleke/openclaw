import { Type } from "@sinclair/typebox";
import type { LinWheel } from "@linwheel/sdk";
import { jsonResult, readStringParam } from "../../../../src/agents/tools/common.js";

export function createAnalyzeTool(client: LinWheel) {
  return {
    name: "linwheel_analyze",
    description:
      "Analyze text content for LinkedIn posting potential. Returns topic relevance scores, suggested angles with hook ideas, a LinkedIn fit score (1-10), and recommended post count. Use this first before reshaping.",
    parameters: Type.Object({
      text: Type.String({ description: "The text content to analyze" }),
      context: Type.Optional(
        Type.String({ description: 'Optional context, e.g. "buildlog entry about shipping an MCP server"' }),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const text = readStringParam(params, "text", { required: true });
      const context = readStringParam(params, "context");
      const result = await client.analyze({ text, context });
      return jsonResult(result);
    },
  };
}
