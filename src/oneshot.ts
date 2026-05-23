/**
 * One-shot mode: `ai <request>`. Generates a single command and drives the
 * Ink-based Run/Revise/Copy/Cancel frame, which owns the revise loop. The chosen
 * command is run here, after the frame has closed and released the terminal.
 */
import type { Config } from './config.ts';
import { toProviderConfig } from './config.ts';
import { gatherContext } from './context.ts';
import { runSuggestionFlow } from './flow.ts';
import { buildOneShotPrompt } from './prompt.ts';
import { type Message, createProvider } from './providers/index.ts';
import { logError, logMessage } from './ui.ts';

export async function runOneShot(request: string, config: Config): Promise<void> {
  const ctx = await gatherContext(config.behavior);
  const provider = createProvider(toProviderConfig(config));
  const messages: Message[] = [
    { role: 'system', content: buildOneShotPrompt(ctx) },
    { role: 'user', content: request },
  ];

  const outcome = await runSuggestionFlow({
    provider,
    behavior: config.behavior,
    messages,
    mode: 'oneshot',
  });
  switch (outcome.kind) {
    case 'run':
      // The command (and any failure-fix loop) already executed in the flow.
      return;
    case 'chat':
      logMessage(outcome.message);
      return;
    case 'error':
      logError(outcome.message);
      process.exitCode = 1;
      return;
    case 'cancel':
      return;
  }
}
