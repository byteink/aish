/**
 * One-shot mode: `ai <request>`. Generates a single command, presents the
 * Run/Revise/Copy/Cancel flow, and loops on Revise with the user's feedback.
 */
import type { Config } from './config.ts';
import { toProviderConfig } from './config.ts';
import { gatherContext } from './context.ts';
import { presentSuggestion } from './flow.ts';
import { buildOneShotPrompt, parseReply } from './prompt.ts';
import { type Message, createProvider } from './providers/index.ts';
import { collectWithSpinner, logError, logMessage } from './ui.ts';

// Bound the revise loop so a misbehaving model can never spin forever.
const MAX_REVISIONS = 20;

export async function runOneShot(request: string, config: Config): Promise<void> {
  const ctx = await gatherContext(config.behavior);
  const provider = createProvider(toProviderConfig(config));
  const messages: Message[] = [
    { role: 'system', content: buildOneShotPrompt(ctx) },
    { role: 'user', content: request },
  ];

  for (let i = 0; i < MAX_REVISIONS; i++) {
    let raw: string;
    try {
      raw = await collectWithSpinner(provider.chat(messages), 'Thinking');
    } catch (err) {
      logError(`Generation failed: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }

    const reply = parseReply(raw, 'oneshot');
    if (reply.type === 'chat') {
      // Model answered conversationally instead of proposing a command.
      logMessage(reply.message);
      return;
    }

    const outcome = await presentSuggestion(reply, config.behavior);
    if (outcome.kind === 'done') return;

    messages.push({ role: 'assistant', content: raw });
    messages.push({ role: 'user', content: `Revise the command: ${outcome.feedback}` });
  }

  logError('Too many revisions; stopping.');
}
