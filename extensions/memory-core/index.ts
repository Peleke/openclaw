import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

const memoryCorePlugin = {
  id: "memory-core",
  name: "Memory (Core)",
  description: "File-backed memory search tools and CLI",
  kind: "memory",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerTool(
      (ctx) => {
        const qortexConnection = api.runtime.tools.getSharedQortexConnection();
        const memorySearchTool = api.runtime.tools.createMemorySearchTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
          qortexConnection,
        });
        const memoryGetTool = api.runtime.tools.createMemoryGetTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
          qortexConnection,
        });
        if (!memorySearchTool || !memoryGetTool) return null;
        const tools = [memorySearchTool, memoryGetTool];
        const feedbackTool = api.runtime.tools.createMemoryFeedbackTool({
          config: ctx.config,
          agentSessionKey: ctx.sessionKey,
          qortexConnection,
        });
        if (feedbackTool) tools.push(feedbackTool);
        return tools;
      },
      { names: ["memory_search", "memory_get", "memory_feedback"] },
    );

    api.registerCli(
      ({ program }) => {
        api.runtime.tools.registerMemoryCli(program);
      },
      { commands: ["memory"] },
    );
  },
};

export default memoryCorePlugin;
