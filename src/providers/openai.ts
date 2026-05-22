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
    // Only send reasoning_effort when thinking is explicitly enabled: passing it
    // to a non-reasoning model (e.g. gpt-4o) is rejected with a 400.
    const extra = opts?.think ? { reasoning_effort: 'high' } : {};
    return streamOpenAICompat(this.baseUrl, this.model, messages, this.apiKey, opts, extra);
  }

  listModels(): Promise<string[]> {
    return listOpenAICompatModels(this.baseUrl, this.apiKey);
  }
}
