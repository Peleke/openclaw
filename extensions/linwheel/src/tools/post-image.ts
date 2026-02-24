import { Type } from "@sinclair/typebox";
import type { LinWheel, StylePreset } from "@linwheel/sdk";
import { optionalStringEnum } from "../../../../src/agents/schema/typebox.js";
import { jsonResult, readStringParam } from "../../../../src/agents/tools/common.js";

const STYLE_PRESETS = [
  "typographic_minimal",
  "gradient_text",
  "dark_mode",
  "accent_bar",
  "abstract_shapes",
] as const;

export function createPostImageTool(client: LinWheel) {
  return {
    name: "linwheel_post_image",
    description:
      "Generate a typographic hero image for a post. Renders headline text on a styled background.",
    parameters: Type.Object({
      postId: Type.String({ description: "The post ID to attach the image to" }),
      headlineText: Type.String({ description: "Text to render on the image (max 200 chars)" }),
      stylePreset: optionalStringEnum(STYLE_PRESETS, { description: "Visual style (default: typographic_minimal)" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const postId = readStringParam(params, "postId", { required: true });
      const headlineText = readStringParam(params, "headlineText", { required: true });
      const result = await client.posts.image(postId, {
        headlineText,
        stylePreset: (params.stylePreset as StylePreset) ?? undefined,
      });
      return jsonResult(result);
    },
  };
}
