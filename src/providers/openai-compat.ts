/**
 * Shared OpenAI-compatible chat core. Ollama, LM Studio and OpenAI all speak
 * the same `/chat/completions` and `/models` shapes, so they reuse this; only
 * their default base URL and auth differ.
 */
import type { ChatOptions, Message, Provider, ProviderConfig, ProviderKind } from './index.ts';
import { readSSE } from './sse.ts';

interface StreamDelta {
  choices?: Array<{ delta?: { content?: string | null } }>;
}

interface ModelList {
  data?: Array<{ id?: string }>;
}

function authHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

/**
 * Stream a chat completion as text chunks from any OpenAI-compatible endpoint.
 * `extraBody` carries provider-specific fields (e.g. reasoning controls) that
 * are merged into the request body.
 */
export async function* streamOpenAICompat(
  baseUrl: string,
  model: string,
  messages: Message[],
  apiKey: string | undefined,
  opts: ChatOptions | undefined,
  extraBody: Record<string, unknown> = {},
): AsyncGenerator<string, void, unknown> {
  const body = {
    model,
    messages,
    stream: true,
    ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...extraBody,
  };

  const fetchInit: RequestInit = {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  };
  if (opts?.signal) fetchInit.signal = opts.signal;

  const res = await fetch(`${baseUrl}/chat/completions`, fetchInit);
  if (!res.ok) {
    throw new Error(`chat request failed: ${res.status} ${await safeBody(res)}`);
  }

  for await (const data of readSSE(res)) {
    if (data === '[DONE]') return;
    let parsed: StreamDelta;
    try {
      parsed = JSON.parse(data) as StreamDelta;
    } catch {
      // Tolerate keep-alive or partial frames rather than aborting the stream.
      continue;
    }
    const piece = parsed.choices?.[0]?.delta?.content;
    if (piece) yield piece;
  }
}

/**
 * Base provider for any OpenAI-compatible endpoint (Ollama, LM Studio, OpenAI
 * all speak this dialect). Subclasses inherit the streaming chat and model
 * listing; the one thing that varies per vendor — how the `think` flag maps to
 * the request body — is a protected hook they override (Template Method). The
 * named subclasses also give each vendor a home for future native behaviour.
 */
export class OpenAICompatProvider implements Provider {
  readonly kind: ProviderKind;
  readonly model: string;
  protected readonly baseUrl: string;
  protected readonly apiKey: string | undefined;

  constructor(config: ProviderConfig) {
    this.kind = config.kind;
    this.model = config.model;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
  }

  /**
   * Request fields derived from the `think` flag. Default: graded high/low
   * effort, omitted entirely when unset so the model's own default stands.
   * Local servers accept this on any model; override where a vendor differs.
   */
  protected reasoningBody(think: boolean | undefined): Record<string, unknown> {
    return think === undefined ? {} : { reasoning_effort: think ? 'high' : 'low' };
  }

  chat(messages: Message[], opts?: ChatOptions): AsyncGenerator<string, void, unknown> {
    return streamOpenAICompat(
      this.baseUrl,
      this.model,
      messages,
      this.apiKey,
      opts,
      this.reasoningBody(opts?.think),
    );
  }

  listModels(): Promise<string[]> {
    return listOpenAICompatModels(this.baseUrl, this.apiKey);
  }
}

/** List model ids from an OpenAI-compatible `/models` endpoint. */
export async function listOpenAICompatModels(
  baseUrl: string,
  apiKey: string | undefined,
): Promise<string[]> {
  const res = await fetch(`${baseUrl}/models`, { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error(`list models failed: ${res.status} ${await safeBody(res)}`);
  const json = (await res.json()) as ModelList;
  return (json.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === 'string')
    .sort();
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}
