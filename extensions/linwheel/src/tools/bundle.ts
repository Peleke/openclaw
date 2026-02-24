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

export function createBundleTool(client: LinWheel) {
  return {
    name: "linwheel_bundle",
    description:
      "Create a post with hero image and/or carousel in one call. Provide imageHeadlineText for an image, carouselSlides for a carousel, or both.",
    parameters: Type.Object({
      fullText: Type.String({ description: "Full post text" }),
      hook: Type.Optional(Type.String({ description: "Opening hook line" })),
      postType: Type.Optional(Type.String({ description: "Content angle" })),
      approved: Type.Optional(Type.Boolean({ description: "Pre-approve (default: false)" })),
      autoPublish: Type.Optional(Type.Boolean({ description: "Auto-publish (default: true)" })),
      scheduledAt: Type.Optional(Type.String({ description: "ISO 8601 scheduled time" })),
      imageHeadlineText: Type.Optional(Type.String({ description: "Hero image headline (max 200 chars). Omit to skip." })),
      imageStylePreset: optionalStringEnum(STYLE_PRESETS, { description: "Image style (default: typographic_minimal)" }),
      carouselSlides: Type.Optional(
        Type.Array(
          Type.Object({
            headlineText: Type.String({ description: "Slide headline" }),
            caption: Type.Optional(Type.String({ description: "Slide caption" })),
          }),
          { description: "Carousel slides (1-10). Omit to skip." },
        ),
      ),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const fullText = readStringParam(params, "fullText", { required: true });
      const result = await client.bundle({
        fullText,
        hook: readStringParam(params, "hook"),
        postType: readStringParam(params, "postType"),
        approved: typeof params.approved === "boolean" ? params.approved : undefined,
        autoPublish: typeof params.autoPublish === "boolean" ? params.autoPublish : undefined,
        scheduledAt: readStringParam(params, "scheduledAt"),
        imageHeadlineText: readStringParam(params, "imageHeadlineText"),
        imageStylePreset: (params.imageStylePreset as StylePreset) ?? undefined,
        carouselSlides: Array.isArray(params.carouselSlides) ? (params.carouselSlides as CarouselSlide[]) : undefined,
      });
      return jsonResult(result);
    },
  };
}
