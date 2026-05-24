/**
 * Provider abstraction. Every provider implements `chat()` (streaming) and
 * `listModels()`. Adding a provider means implementing this interface and
 * wiring it into `createProvider`; nothing else in the app knows the vendor.
 */
import { AnthropicProvider } from './anthropic.ts';
import { LMStudioProvider } from './lmstudio.ts';
import { OllamaProvider } from './ollama.ts';
import { OpenAIProvider } from './openai.ts';
import { OpenRouterProvider } from './openrouter.ts';

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export interface ChatOptions {
  /** Abort in-flight generation (Esc / cancel). */
  signal?: AbortSignal;
  temperature?: number;
  /**
   * Ask a reasoning-capable model to think (true) or skip reasoning (false).
   * Best-effort and provider/model dependent; ignored where unsupported.
   */
  think?: boolean;
}

export type ProviderKind = 'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'openrouter';

export interface ProviderConfig {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  /** Required for remote providers; ignored by local ones. */
  apiKey?: string;
}

export interface Provider {
  readonly kind: ProviderKind;
  readonly model: string;
  /** Stream the assistant reply as text chunks. */
  chat(messages: Message[], opts?: ChatOptions): AsyncGenerator<string, void, unknown>;
  /** List model ids available at the configured endpoint. */
  listModels(): Promise<string[]>;
}

/** Default endpoints. Local providers expose OpenAI-compatible HTTP APIs. */
export const DEFAULT_BASE_URLS: Record<ProviderKind, string> = {
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
};

export function isRemote(kind: ProviderKind): boolean {
  return kind === 'openai' || kind === 'anthropic' || kind === 'openrouter';
}

// Registry of provider constructors. Adding a vendor means adding its class and
// one entry here; the exhaustive Record guarantees every kind stays mapped.
const PROVIDERS: Record<ProviderKind, new (config: ProviderConfig) => Provider> = {
  ollama: OllamaProvider,
  lmstudio: LMStudioProvider,
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  openrouter: OpenRouterProvider,
};

/** Build a concrete provider from config. The single dispatch point. */
export function createProvider(config: ProviderConfig): Provider {
  return new PROVIDERS[config.kind](config);
}
