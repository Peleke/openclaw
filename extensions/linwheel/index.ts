import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { createLinWheelClient } from "./src/client-factory.js";
import { createAllTools } from "./src/tools/index.js";

export default function register(api: OpenClawPluginApi) {
  const client = createLinWheelClient(api);
  if (!client) {
    api.logger.warn(
      "linwheel: skipping — no API key configured (set plugins.linwheel.apiKey or LINWHEEL_API_KEY)",
    );
    return;
  }

  for (const tool of createAllTools(client)) {
    api.registerTool(tool, { optional: true });
  }
}
