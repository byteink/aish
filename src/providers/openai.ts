import type { ChatOptions, Message, Provider, ProviderConfig } from './index.ts';
import { listOpenAICompatModels, streamOpenAICompat } from './openai-compat.ts';

/** Remote OpenAI (or any OpenAI-compatible API requiring a bearer key). */
export class OpenAIProvider implements Provider {
  readonly kind = 'openai' as const;
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
