/**
 * OpenClaw LLM Adapter.
 *
 * Implements the LLMProvider interface using OpenClaw's infrastructure.
 * Uses OpenClaw's auth system for API keys and model configuration.
 *
 * This adapter bridges Cadence (portable) with OpenClaw (host application).
 */

import { loadConfig, type OpenClawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getApiKeyForModel } from "../../agents/model-auth.js";
import { resolveModel } from "../../agents/pi-embedded-runner/model.js";
import { resolveOpenClawAgentDir } from "../../agents/agent-paths.js";

import type { ChatMessage, ChatOptions, ChatResponse, LLMProvider } from "./types.js";

const log = createSubsystemLogger("cadence").child("llm-adapter");

// Default models for different providers
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-3-5-haiku-latest",
  openai: "gpt-4o-mini",
};

export interface OpenClawLLMAdapterOptions {
  /** Override the default model */
  defaultModel?: string;

  /** Override the default provider */
  defaultProvider?: string;

  /** Config override (defaults to loadConfig()) */
  config?: OpenClawConfig;
}

/**
 * Create an LLM provider that uses OpenClaw's infrastructure.
 */
export function createOpenClawLLMAdapter(options: OpenClawLLMAdapterOptions = {}): LLMProvider {
  const { defaultProvider = "anthropic", defaultModel, config: configOverride } = options;

  return {
    name: "openclaw",

    async chat(messages: ChatMessage[], chatOptions?: ChatOptions): Promise<ChatResponse> {
      const cfg = configOverride ?? loadConfig();
      const agentDir = resolveOpenClawAgentDir();

      // Resolve model
      const provider = defaultProvider;
      const modelId =
        chatOptions?.model ?? defaultModel ?? DEFAULT_MODELS[provider] ?? "claude-3-5-haiku-latest";

      log.debug(`LLM chat request`, { provider, model: modelId, messageCount: messages.length });

      // Get model info from OpenClaw's model registry
      const { model: modelInfo, authStorage } = resolveModel(provider, modelId, agentDir, cfg);

      if (!modelInfo) {
        throw new Error(`Unknown model: ${provider}/${modelId}`);
      }

      // Get API key from OpenClaw's auth system
      const apiKeyResult = await getApiKeyForModel({
        model: modelInfo,
        cfg,
        agentDir,
      });

      if (!apiKeyResult.apiKey) {
        throw new Error(
          `No API key available for ${provider}/${modelId}. ` +
            `Run 'openclaw auth add ${provider}' to configure credentials.`,
        );
      }

      // Route to appropriate provider
      if (provider === "anthropic" || modelInfo.api === "anthropic-messages") {
        return callAnthropic(messages, {
          model: modelId,
          apiKey: apiKeyResult.apiKey,
          maxTokens: chatOptions?.maxTokens ?? 4096,
          temperature: chatOptions?.temperature,
          signal: chatOptions?.signal,
        });
      }

      // Fallback: OpenAI-compatible API
      if (provider === "openai" || modelInfo.api?.startsWith("openai")) {
        return callOpenAICompatible(messages, {
          model: modelId,
          apiKey: apiKeyResult.apiKey,
          baseUrl: modelInfo.baseUrl,
          maxTokens: chatOptions?.maxTokens ?? 4096,
          temperature: chatOptions?.temperature,
          signal: chatOptions?.signal,
        });
      }

      throw new Error(`Unsupported provider: ${provider}. Currently supported: anthropic, openai`);
    },
  };
}

/**
 * Call Anthropic API directly using fetch.
 */
async function callAnthropic(
  messages: ChatMessage[],
  options: {
    model: string;
    apiKey: string;
    maxTokens: number;
    temperature?: number;
    signal?: AbortSignal;
  },
): Promise<ChatResponse> {
  // Separate system message from conversation
  const systemMessage = messages.find((m) => m.role === "system");
  const conversationMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      system: systemMessage?.content,
      messages: conversationMessages,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
    model: string;
    usage: { input_tokens: number; output_tokens: number };
    stop_reason: string;
  };

  // Extract text from response
  const textContent = data.content.find((c) => c.type === "text");
  const text = textContent?.text ?? "";

  return {
    text,
    model: data.model,
    usage: {
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    },
    stopReason:
      data.stop_reason === "end_turn"
        ? "stop"
        : data.stop_reason === "max_tokens"
          ? "length"
          : "stop",
  };
}

/**
 * Call OpenAI-compatible API.
 */
async function callOpenAICompatible(
  messages: ChatMessage[],
  options: {
    model: string;
    apiKey: string;
    baseUrl?: string;
    maxTokens: number;
    temperature?: number;
    signal?: AbortSignal;
  },
): Promise<ChatResponse> {
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const choice = data.choices[0];
  if (!choice) {
    throw new Error("No response from OpenAI API");
  }

  return {
    text: choice.message.content ?? "",
    model: data.model,
    usage: data.usage
      ? {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
        }
      : undefined,
    stopReason:
      choice.finish_reason === "stop"
        ? "stop"
        : choice.finish_reason === "length"
          ? "length"
          : "stop",
  };
}

/**
 * Create a mock LLM provider for testing.
 */
export function createMockLLMProvider(mockResponses?: Map<string, string>): LLMProvider {
  const responses = mockResponses ?? new Map();

  return {
    name: "mock",

    async chat(messages: ChatMessage[]): Promise<ChatResponse> {
      // Check if there's a mock response for the last user message
      const lastUserMessage = messages.filter((m) => m.role === "user").pop();
      const mockResponse = lastUserMessage ? responses.get(lastUserMessage.content) : undefined;

      return {
        text: mockResponse ?? "[]", // Default to empty JSON array for insight extraction
        model: "mock-model",
        usage: { inputTokens: 100, outputTokens: 50 },
        stopReason: "stop",
      };
    },
  };
}
