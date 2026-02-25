import type { Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import { CANVAS_HOST_PATH } from "../canvas-host/a2ui.js";
import { type CanvasHostHandler, createCanvasHostHandler } from "../canvas-host/server.js";
import type { CliDeps } from "../cli/deps.js";
import type { createSubsystemLogger } from "../logging/subsystem.js";
import type { RuntimeEnv } from "../runtime.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import type { ChatAbortControllerEntry } from "./chat-abort.js";
import type { HooksConfigResolved } from "./hooks.js";
import { createGatewayHooksRequestHandler } from "./server/hooks.js";
import { listenGatewayHttpServer } from "./server/http-listen.js";
import { resolveGatewayListenHosts } from "./net.js";
import { createGatewayPluginRequestHandler } from "./server/plugins-http.js";
import type { GatewayWsClient } from "./server/ws-types.js";
import { createGatewayBroadcaster } from "./server-broadcast.js";
import { type ChatRunEntry, createChatRunState } from "./server-chat.js";
import { MAX_PAYLOAD_BYTES } from "./server-constants.js";
import { attachGatewayUpgradeHandler, createGatewayHttpServer } from "./server-http.js";
import type { DedupeEntry } from "./server-shared.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { GatewayTlsRuntime } from "./server/tls.js";

export async function createGatewayRuntimeState(params: {
  cfg: import("../config/config.js").OpenClawConfig;
  bindHost: string;
  port: number;
  controlUiEnabled: boolean;
  controlUiBasePath: string;
  openAiChatCompletionsEnabled: boolean;
  openResponsesEnabled: boolean;
  openResponsesConfig?: import("../config/types.gateway.js").GatewayHttpResponsesConfig;
  resolvedAuth: ResolvedGatewayAuth;
  gatewayTls?: GatewayTlsRuntime;
  hooksConfig: () => HooksConfigResolved | null;
  pluginRegistry: PluginRegistry;
  deps: CliDeps;
  canvasRuntime: RuntimeEnv;
  canvasHostEnabled: boolean;
  allowCanvasHostInTests?: boolean;
  logCanvas: { info: (msg: string) => void; warn: (msg: string) => void };
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  logHooks: ReturnType<typeof createSubsystemLogger>;
  logPlugins: ReturnType<typeof createSubsystemLogger>;
}): Promise<{
  canvasHost: CanvasHostHandler | null;
  httpServer: HttpServer;
  httpServers: HttpServer[];
  httpBindHosts: string[];
  wss: WebSocketServer;
  clients: Set<GatewayWsClient>;
  broadcast: (
    event: string,
    payload: unknown,
    opts?: {
      dropIfSlow?: boolean;
      stateVersion?: { presence?: number; health?: number };
    },
  ) => void;
  agentRunSeq: Map<string, number>;
  dedupe: Map<string, DedupeEntry>;
  chatRunState: ReturnType<typeof createChatRunState>;
  chatRunBuffers: Map<string, string>;
  chatDeltaSentAt: Map<string, number>;
  addChatRun: (sessionId: string, entry: ChatRunEntry) => void;
  removeChatRun: (
    sessionId: string,
    clientRunId: string,
    sessionKey?: string,
  ) => ChatRunEntry | undefined;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
}> {
  let canvasHost: CanvasHostHandler | null = null;
  if (params.canvasHostEnabled) {
    try {
      const handler = await createCanvasHostHandler({
        runtime: params.canvasRuntime,
        rootDir: params.cfg.canvasHost?.root,
        basePath: CANVAS_HOST_PATH,
        allowInTests: params.allowCanvasHostInTests,
        liveReload: params.cfg.canvasHost?.liveReload,
      });
      if (handler.rootDir) {
        canvasHost = handler;
        params.logCanvas.info(
          `canvas host mounted at http://${params.bindHost}:${params.port}${CANVAS_HOST_PATH}/ (root ${handler.rootDir})`,
        );
      }
    } catch (err) {
      params.logCanvas.warn(`canvas host failed to start: ${String(err)}`);
    }
  }

  const handleHooksRequest = createGatewayHooksRequestHandler({
    deps: params.deps,
    getHooksConfig: params.hooksConfig,
    bindHost: params.bindHost,
    port: params.port,
    logHooks: params.logHooks,
  });

  const handlePluginRequest = createGatewayPluginRequestHandler({
    registry: params.pluginRegistry,
    log: params.logPlugins,
  });

  // Shared qortex connection: one process-wide connection for the entire gateway lifetime.
  // Used by learning API, learning select/observe (agent runs), memory search/get/feedback.
  // Eagerly initialized so it's ready before the first message arrives.
  // Supports both stdio (subprocess) and HTTP (remote qortex serve) transports.
  try {
    const { QortexMcpConnection, parseCommandString, setSharedQortexConnection } =
      await import("../qortex/connection.js");
    const learningCfg = params.cfg?.learning;
    const memoryCfg = params.cfg?.agents?.defaults?.memorySearch;

    const transport = learningCfg?.qortex?.transport ?? memoryCfg?.qortex?.transport;
    const httpConfig = learningCfg?.qortex?.http ?? memoryCfg?.qortex?.http;

    let sharedConn: import("../qortex/types.js").QortexConnection;
    if (transport === "http" && httpConfig) {
      const { QortexHttpConnection } = await import("../qortex/http-connection.js");
      sharedConn = new QortexHttpConnection(httpConfig.baseUrl, httpConfig.headers);
    } else {
      const qortexCmd =
        learningCfg?.qortex?.command ?? memoryCfg?.qortex?.command ?? "uvx qortex mcp-serve";
      const connConfig = parseCommandString(qortexCmd);
      sharedConn = new QortexMcpConnection(connConfig);
    }

    try {
      await sharedConn.init();
      setSharedQortexConnection(sharedConn);
      const transportLabel = transport === "http" ? `http → ${httpConfig?.baseUrl}` : "stdio";
      const learningCfgStatus = learningCfg?.enabled
        ? `learning: active, phase=${learningCfg.phase ?? "unknown"}, learner=${learningCfg.learnerName ?? "openclaw"}`
        : "learning: disabled";
      params.log.info(`qortex shared connection ready [${transportLabel}] (${learningCfgStatus})`);
    } catch (err) {
      params.log.warn(`qortex shared connection failed to init: ${String(err)}`);
    }
  } catch (err) {
    params.log.info(`qortex module not available, skipping shared connection: ${String(err)}`);
  }

  // Learning API — uses the shared qortex connection
  let handleLearningApiRequest: import("./server-http.js").HooksRequestHandler | undefined;
  try {
    const { createLearningApiHandler } = await import("../learning/api.js");
    const { QortexLearningClient } = await import("../learning/qortex-client.js");
    const { getSharedQortexConnection } = await import("../qortex/connection.js");
    let learningClient: InstanceType<typeof QortexLearningClient> | null = null;
    const learningCfg = params.cfg?.learning;
    handleLearningApiRequest = createLearningApiHandler({
      getClient: () => {
        if (!learningClient) {
          try {
            const conn = getSharedQortexConnection();
            if (!conn) return null;
            learningClient = new QortexLearningClient(conn, learningCfg?.learnerName);
          } catch {
            return null;
          }
        }
        return learningClient;
      },
      getConfig: () => learningCfg ?? null,
    });
  } catch {
    // Learning module not available — skip
  }

  // Green API — lazily open DB on first request
  let handleGreenApiRequest: import("./server-http.js").HooksRequestHandler | undefined;
  try {
    const { createGreenApiHandler } = await import("../green/api.js");
    const { openGreenDb } = await import("../green/store.js");
    const { resolveOpenClawAgentDir } = await import("../agents/agent-paths.js");
    let greenDb: import("node:sqlite").DatabaseSync | null = null;
    const agentDir = resolveOpenClawAgentDir();
    handleGreenApiRequest = createGreenApiHandler({
      getDb: () => {
        if (!greenDb) {
          try {
            greenDb = openGreenDb(agentDir);
          } catch {
            return null;
          }
        }
        return greenDb;
      },
    });
  } catch {
    // Green module not available — skip
  }

  const bindHosts = await resolveGatewayListenHosts(params.bindHost);
  const httpServers: HttpServer[] = [];
  const httpBindHosts: string[] = [];
  for (const host of bindHosts) {
    const httpServer = createGatewayHttpServer({
      canvasHost,
      controlUiEnabled: params.controlUiEnabled,
      controlUiBasePath: params.controlUiBasePath,
      openAiChatCompletionsEnabled: params.openAiChatCompletionsEnabled,
      openResponsesEnabled: params.openResponsesEnabled,
      openResponsesConfig: params.openResponsesConfig,
      handleHooksRequest,
      handlePluginRequest,
      handleLearningApiRequest,
      handleGreenApiRequest,
      resolvedAuth: params.resolvedAuth,
      tlsOptions: params.gatewayTls?.enabled ? params.gatewayTls.tlsOptions : undefined,
    });
    try {
      await listenGatewayHttpServer({
        httpServer,
        bindHost: host,
        port: params.port,
      });
      httpServers.push(httpServer);
      httpBindHosts.push(host);
    } catch (err) {
      if (host === bindHosts[0]) throw err;
      params.log.warn(
        `gateway: failed to bind loopback alias ${host}:${params.port} (${String(err)})`,
      );
    }
  }
  const httpServer = httpServers[0];
  if (!httpServer) {
    throw new Error("Gateway HTTP server failed to start");
  }

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
  });
  for (const server of httpServers) {
    attachGatewayUpgradeHandler({ httpServer: server, wss, canvasHost });
  }

  const clients = new Set<GatewayWsClient>();
  const { broadcast } = createGatewayBroadcaster({ clients });
  const agentRunSeq = new Map<string, number>();
  const dedupe = new Map<string, DedupeEntry>();
  const chatRunState = createChatRunState();
  const chatRunRegistry = chatRunState.registry;
  const chatRunBuffers = chatRunState.buffers;
  const chatDeltaSentAt = chatRunState.deltaSentAt;
  const addChatRun = chatRunRegistry.add;
  const removeChatRun = chatRunRegistry.remove;
  const chatAbortControllers = new Map<string, ChatAbortControllerEntry>();

  return {
    canvasHost,
    httpServer,
    httpServers,
    httpBindHosts,
    wss,
    clients,
    broadcast,
    agentRunSeq,
    dedupe,
    chatRunState,
    chatRunBuffers,
    chatDeltaSentAt,
    addChatRun,
    removeChatRun,
    chatAbortControllers,
  };
}
