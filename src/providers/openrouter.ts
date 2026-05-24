import { OpenAICompatProvider } from './openai-compat.ts';

/**
 * OpenRouter: an OpenAI-compatible aggregator (https://openrouter.ai/api/v1)
 * that fronts many vendors' models behind one Bearer-keyed endpoint. Reasoning
 * is controlled by OpenRouter's unified `reasoning` field rather than OpenAI's
 * `reasoning_effort`; like the OpenAI provider we send it only when thinking is
 * explicitly enabled, so the many models that don't reason never see a field
 * they might reject.
 */
export class OpenRouterProvider extends OpenAICompatProvider {
  protected override reasoningBody(think: boolean | undefined): Record<string, unknown> {
    return think ? { reasoning: { effort: 'high' } } : {};
  }
}
