import { OpenAICompatProvider } from './openai-compat.ts';

/**
 * LM Studio via its OpenAI-compatible server (default http://localhost:1234/v1).
 * The base URL may point at any host (LAN, proxy, tunnel) and an API key is
 * optional. Behaviour matches the OpenAI-compatible base; this subclass is the
 * extension point for any LM Studio-specific handling added later.
 */
export class LMStudioProvider extends OpenAICompatProvider {}
