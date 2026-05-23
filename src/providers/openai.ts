import { OpenAICompatProvider } from './openai-compat.ts';

/**
 * Remote OpenAI (or any OpenAI-compatible API requiring a bearer key). Differs
 * from the local providers in one way: `reasoning_effort` is only sent when
 * thinking is explicitly enabled, because non-reasoning models (e.g. gpt-4o)
 * reject the field with a 400.
 */
export class OpenAIProvider extends OpenAICompatProvider {
  protected override reasoningBody(think: boolean | undefined): Record<string, unknown> {
    return think ? { reasoning_effort: 'high' } : {};
  }
}
