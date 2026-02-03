/**
 * Cadence LLM Provider module.
 *
 * Provides a portable abstraction for LLM calls.
 * Implementations can use any backend (OpenClaw, Ollama, direct API, etc.)
 */

// Core types
export type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  LLMProviderFactory,
} from "./types.js";

export { toLegacyLLMProvider } from "./types.js";

// OpenClaw adapter (default implementation)
export {
  createOpenClawLLMAdapter,
  createMockLLMProvider,
  type OpenClawLLMAdapterOptions,
} from "./openclaw-adapter.js";
