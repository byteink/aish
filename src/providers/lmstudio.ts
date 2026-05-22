import type { ChatOptions, Message, Provider, ProviderConfig } from './index.ts';
import { listOpenAICompatModels, streamOpenAICompat } from './openai-compat.ts';

/** LM Studio via its OpenAI-compatible server (default http://localhost:1234/v1). */
export class LMStudioProvider implements Provider {
  readonly kind = 'lmstudio' as const;
  readonly model: string;
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
  }

  chat(messages: Message[], opts?: ChatOptions): AsyncGenerator<string, void, unknown> {
    return streamOpenAICompat(this.baseUrl, this.model, messages, undefined, opts);
  }

  listModels(): Promise<string[]> {
    return listOpenAICompatModels(this.baseUrl, undefined);
  }
}
