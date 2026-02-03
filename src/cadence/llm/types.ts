/**
 * LLM Provider interface for Cadence.
 *
 * This is the abstraction layer between Cadence responders and any LLM backend.
 * Implementations can use OpenClaw, direct API calls, Ollama, etc.
 *
 * Design principle: Cadence remains portable and backend-agnostic.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  /** Model identifier (e.g., "claude-3-haiku", "gpt-4o-mini") */
  model?: string;

  /** Temperature for response randomness (0-1) */
  temperature?: number;

  /** Maximum tokens in response */
  maxTokens?: number;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Optional metadata for logging/tracing */
  metadata?: Record<string, unknown>;
}

export interface ChatResponse {
  /** The assistant's response text */
  text: string;

  /** Model that generated the response */
  model: string;

  /** Token usage (if available) */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };

  /** Stop reason */
  stopReason?: "stop" | "length" | "error";
}

/**
 * LLM Provider interface.
 *
 * Implementations must provide a simple chat method.
 * This keeps the interface minimal and easy to implement.
 */
export interface LLMProvider {
  /** Provider name for logging/debugging */
  readonly name: string;

  /**
   * Send a chat completion request.
   *
   * @param messages - Array of chat messages (system, user, assistant)
   * @param options - Optional configuration
   * @returns The assistant's response
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}

/**
 * Factory function type for creating LLM providers.
 * Useful for dependency injection and testing.
 */
export type LLMProviderFactory = (config?: unknown) => LLMProvider;

/**
 * Simple adapter for the legacy LLMProvider interface used in insight-extractor.
 * Maps the new interface to the old one for backwards compatibility.
 */
export function toLegacyLLMProvider(provider: LLMProvider): {
  chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  ): Promise<string>;
} {
  return {
    async chat(messages) {
      const response = await provider.chat(messages);
      return response.text;
    },
  };
}
