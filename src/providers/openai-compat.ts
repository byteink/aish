/**
 * Shared OpenAI-compatible chat core. Ollama, LM Studio and OpenAI all speak
 * the same `/chat/completions` and `/models` shapes, so they reuse this; only
 * their default base URL and auth differ.
 */
import type { ChatOptions, Message } from './index.ts';
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

/** Stream a chat completion as text chunks from any OpenAI-compatible endpoint. */
export async function* streamOpenAICompat(
  baseUrl: string,
  model: string,
  messages: Message[],
  apiKey: string | undefined,
  opts: ChatOptions | undefined,
): AsyncGenerator<string, void, unknown> {
  const body = {
    model,
    messages,
    stream: true,
    ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
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
