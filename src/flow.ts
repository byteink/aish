/**
 * Orchestrates one request through the suggestion frame and, when a command is
 * run and fails, the failure-fix loop: it asks whether to attempt a fix, feeds
 * the failed command's output back to the model, and re-enters the frame for a
 * corrected command. Shared by one-shot and interactive modes so both behave
 * identically; the caller only decides how to surface chat/error outcomes.
 */
import type { BehaviorConfig } from './config.ts';
import type { Message, Provider } from './providers/index.ts';
import { runCommand } from './runner.ts';
import { confirmFrame } from './tui/confirm.tsx';
import { type TuiOutcome, runSuggestionTui } from './tui/suggestion-app.tsx';

type Mode = 'oneshot' | 'interactive';

// Bound the run/fix loop so a command that keeps failing can never spin forever.
const MAX_RUN_ATTEMPTS = 10;
// How much of the captured output to feed back; errors live at the tail.
const FEEDBACK_OUTPUT_LIMIT = 4000;

interface FlowParams {
  provider: Provider;
  behavior: BehaviorConfig;
  messages: Message[];
  mode: Mode;
}

/**
 * Present a suggestion and run it, looping on failure to offer a fix. Returns
 * the terminal outcome: `run` once a command has executed (success, or a
 * failure the user chose not to fix), or `chat`/`error`/`cancel` for the caller
 * to display. The conversation in `messages` is extended in place.
 */
export async function runSuggestionFlow(params: FlowParams): Promise<TuiOutcome> {
  const { provider, behavior, messages, mode } = params;

  for (let attempt = 0; attempt < MAX_RUN_ATTEMPTS; attempt++) {
    const outcome = await runSuggestionTui({ provider, behavior, messages, mode });
    if (outcome.kind !== 'run') return outcome;

    const { code, output } = await runCommand(outcome.command);
    if (code === 0) return outcome;

    const wantsFix = await confirmFrame(`Command failed (exit ${code}). Suggest a fix?`);
    if (!wantsFix) return outcome;

    messages.push({ role: 'user', content: failureFeedback(outcome.command, code, output) });
  }

  return { kind: 'error', message: 'Too many failed attempts; stopping.' };
}

/** The user turn that hands a failed command's result back to the model. */
function failureFeedback(command: string, code: number, output: string): string {
  const tail =
    output.length > FEEDBACK_OUTPUT_LIMIT ? output.slice(-FEEDBACK_OUTPUT_LIMIT) : output;
  return [
    `The command \`${command}\` failed with exit code ${code}.`,
    'Output:',
    tail.trim() || '(no output)',
    'Suggest a corrected command.',
  ].join('\n');
}
