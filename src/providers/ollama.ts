import type { ChatOptions, Message, Provider, ProviderConfig } from './index.ts';
import { listOpenAICompatModels, streamOpenAICompat } from './openai-compat.ts';

/** Ollama via its OpenAI-compatible endpoint (default http://localhost:11434/v1). */
export class OllamaProvider implements Provider {
  readonly kind = 'ollama' as const;
  readonly model: string;
  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
  }

  chat(messages: Message[], opts?: ChatOptions): AsyncGenerator<string, void, unknown> {
    // Local provider: no API key.
    return streamOpenAICompat(this.baseUrl, this.model, messages, undefined, opts);
  }

  listModels(): Promise<string[]> {
    return listOpenAICompatModels(this.baseUrl, undefined);
  }
}
