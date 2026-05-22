import type { ChatOptions, Message, Provider, ProviderConfig } from './index.ts';
import { listOpenAICompatModels, streamOpenAICompat } from './openai-compat.ts';

/**
 * LM Studio via its OpenAI-compatible server (default http://localhost:1234/v1).
 * The base URL may point at any host (e.g. a box on the LAN or behind a proxy),
 * and an API key is optional for endpoints sitting behind auth.
 */
export class LMStudioProvider implements Provider {
  readonly kind = 'lmstudio' as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.apiKey = config.apiKey;
  }

  chat(messages: Message[], opts?: ChatOptions): AsyncGenerator<string, void, unknown> {
    return streamOpenAICompat(this.baseUrl, this.model, messages, this.apiKey, opts);
  }

  listModels(): Promise<string[]> {
    return listOpenAICompatModels(this.baseUrl, this.apiKey);
  }
}
