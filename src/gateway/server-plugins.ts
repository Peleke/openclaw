import type { loadConfig } from "../config/config.js";
import { loadOpenClawPlugins } from "../plugins/loader.js";
import type { GatewayRequestHandler } from "./server-methods/types.js";

export function loadGatewayPlugins(params: {
  cfg: ReturnType<typeof loadConfig>;
  workspaceDir: string;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  coreGatewayHandlers: Record<string, GatewayRequestHandler>;
  baseMethods: string[];
}) {
  const pluginRegistry = loadOpenClawPlugins({
    config: params.cfg,
    workspaceDir: params.workspaceDir,
    logger: {
      info: (msg) => params.log.info(msg),
      warn: (msg) => params.log.warn(msg),
      error: (msg) => params.log.error(msg),
      debug: (msg) => params.log.debug(msg),
    },
    coreGatewayHandlers: params.coreGatewayHandlers,
  });
  const pluginMethods = Object.keys(pluginRegistry.gatewayHandlers);
  const gatewayMethods = Array.from(new Set([...params.baseMethods, ...pluginMethods]));
  if (pluginRegistry.diagnostics.length > 0) {
    for (const diag of pluginRegistry.diagnostics) {
      const details = [
        diag.pluginId ? `plugin=${diag.pluginId}` : null,
        diag.source ? `source=${diag.source}` : null,
      ]
        .filter((entry): entry is string => Boolean(entry))
        .join(", ");
      const message = details
        ? `[plugins] ${diag.message} (${details})`
        : `[plugins] ${diag.message}`;
      if (diag.level === "error") {
        params.log.error(message);
      } else if (diag.level === "warn") {
        params.log.warn(message);
      } else {
        params.log.info(message);
      }
    }
  }
  const memoryCore = pluginRegistry.plugins.find((p) => p.id === "memory-core");
  if (memoryCore) {
    params.log.info(`[plugins] memory-core loaded (status=${memoryCore.status})`);
  } else {
    params.log.warn(
      "[plugins] memory-core not loaded; memory_search/memory_get will not be available",
    );
  }
  return { pluginRegistry, gatewayMethods };
}
