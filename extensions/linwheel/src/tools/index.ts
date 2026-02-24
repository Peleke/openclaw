import type { LinWheel } from "@linwheel/sdk";
import type { AnyAgentTool } from "../../../../src/agents/tools/common.js";

import { createAnalyzeTool } from "./analyze.js";
import { createReshapeTool } from "./reshape.js";
import { createRefineTool } from "./refine.js";
import { createSplitTool } from "./split.js";
import { createDraftTool } from "./draft.js";
import { createBundleTool } from "./bundle.js";
import { createPostsListTool } from "./posts-list.js";
import { createPostGetTool } from "./post-get.js";
import { createPostUpdateTool } from "./post-update.js";
import { createPostApproveTool } from "./post-approve.js";
import { createPostScheduleTool } from "./post-schedule.js";
import { createPostImageTool } from "./post-image.js";
import { createPostCarouselTool } from "./post-carousel.js";
import { createVoiceProfileTools } from "./voice-profiles.js";

export function createAllTools(client: LinWheel): AnyAgentTool[] {
  return [
    createAnalyzeTool(client),
    createReshapeTool(client),
    createRefineTool(client),
    createSplitTool(client),
    createDraftTool(client),
    createBundleTool(client),
    createPostsListTool(client),
    createPostGetTool(client),
    createPostUpdateTool(client),
    createPostApproveTool(client),
    createPostScheduleTool(client),
    createPostImageTool(client),
    createPostCarouselTool(client),
    ...createVoiceProfileTools(client),
  ];
}
