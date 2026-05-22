import type { ChatOptions, Message, Provider, ProviderConfig } from './index.ts';
import { readSSE } from './sse.ts';

const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 1024;

interface AnthropicDelta {
  type?: string;
  delta?: { type?: string; text?: string };
}

interface AnthropicModelList {
  data?: Array<{ id?: string }>;
}

/** Anthropic Messages API. System turns are hoisted to the top-level field. */
export class AnthropicProvider implements Provider {
  readonly kind = 'anthropic' as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.apiKey = config.apiKey;
  }

  private headers(): Record<string, string> {
    if (!this.apiKey) throw new Error('Anthropic requires an API key');
    return {
      'content-type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };
  }

  async *chat(messages: Message[], opts?: ChatOptions): AsyncGenerator<string, void, unknown> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const turns = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const body = {
      model: this.model,
      max_tokens: MAX_TOKENS,
      stream: true,
      ...(system ? { system } : {}),
      messages: turns,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    };

    const fetchInit: RequestInit = {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    };
    if (opts?.signal) fetchInit.signal = opts.signal;

    const res = await fetch(`${this.baseUrl}/messages`, fetchInit);
    if (!res.ok) {
      throw new Error(`Anthropic chat failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }

    for await (const data of readSSE(res)) {
      let parsed: AnthropicDelta;
      try {
        parsed = JSON.parse(data) as AnthropicDelta;
      } catch {
        continue;
      }
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        const piece = parsed.delta.text;
        if (piece) yield piece;
      }
    }
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/models?limit=100`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Anthropic list models failed: ${res.status}`);
    const json = (await res.json()) as AnthropicModelList;
    return (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
  }
}
