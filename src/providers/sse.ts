/**
 * Minimal Server-Sent Events reader over a fetch Response body. Yields the
 * payload of each `data:` line. Works on the WHATWG stream that both Node 18+
 * and Bun expose on `Response.body`.
 */
export async function* readSSE(response: Response): AsyncGenerator<string, void, unknown> {
  if (!response.body) throw new Error('response has no body to stream');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line; lines within carry "data:".
      let newline: number;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard line-split scan.
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('data:')) {
          yield line.slice(5).trimStart();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
