import { OpenAICompatProvider } from './openai-compat.ts';

/**
 * Ollama via its OpenAI-compatible endpoint (default http://localhost:11434/v1).
 * The base URL may point at any host (LAN, proxy, tunnel) and an API key is
 * optional. Behaviour matches the OpenAI-compatible base; this subclass is the
 * extension point for any Ollama-specific handling added later.
 */
export class OllamaProvider extends OpenAICompatProvider {}
