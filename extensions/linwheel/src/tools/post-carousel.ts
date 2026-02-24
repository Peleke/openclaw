import { Type } from "@sinclair/typebox";
import type { LinWheel, StylePreset, CarouselSlide } from "@linwheel/sdk";
import { optionalStringEnum } from "../../../../src/agents/schema/typebox.js";
import { jsonResult, readStringParam } from "../../../../src/agents/tools/common.js";

const STYLE_PRESETS = [
  "typographic_minimal",
  "gradient_text",
  "dark_mode",
  "accent_bar",
  "abstract_shapes",
] as const;

export function createPostCarouselTool(client: LinWheel) {
  return {
    name: "linwheel_post_carousel",
    description:
      "Generate a text carousel (1-10 slides) for a post. First slide = title, last = CTA, middle = content.",
    parameters: Type.Object({
      postId: Type.String({ description: "The post ID" }),
      slides: Type.Array(
        Type.Object({
          headlineText: Type.String({ description: "Slide headline" }),
          caption: Type.Optional(Type.String({ description: "Slide caption" })),
        }),
        { description: "Carousel slides (1-10)" },
      ),
      stylePreset: optionalStringEnum(STYLE_PRESETS, { description: "Visual style" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const postId = readStringParam(params, "postId", { required: true });
      const slides = params.slides as CarouselSlide[];
      if (!Array.isArray(slides) || slides.length === 0) throw new Error("slides required");
      const result = await client.posts.carousel(postId, {
        slides,
        stylePreset: (params.stylePreset as StylePreset) ?? undefined,
      });
      return jsonResult(result);
    },
  };
}
