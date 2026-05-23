/**
 * The Run / Revise / Copy / Cancel interaction for a proposed command, shared
 * by both the one-shot and interactive modes. Owns the safety gate: a flagged
 * command always demands an extra confirmation and is never auto-run.
 */
import type { BehaviorConfig } from './config.ts';
import type { CommandSuggestion } from './prompt.ts';
import { runCommand } from './runner.ts';
import { copyToClipboard } from './runtime.ts';
import { scanCommand } from './safety.ts';
import {
  cancelled,
  color,
  confirmPrompt,
  isCancel,
  logInfo,
  logWarn,
  note,
  paintLines,
  selectOption,
  textPrompt,
  wrap,
} from './ui.ts';

export type FlowOutcome = { kind: 'done' } | { kind: 'revise'; feedback: string };

/**
 * Present a command suggestion and act on the user's choice. Returns `done`
 * once the command has run, been cancelled, or copied-then-dismissed; returns
 * `revise` with feedback when the user wants a different command.
 */
export async function presentSuggestion(
  suggestion: CommandSuggestion,
  behavior: BehaviorConfig,
): Promise<FlowOutcome> {
  const safety = scanCommand(suggestion.command);

  // Wrap to the terminal width first, then colour each line, so the SGR codes
  // stay within a line and never bleed into clack's box border. The box holds
  // the command only; the explanation is shown on the spinner's completion line.
  note(paintLines(wrap(suggestion.command), color.bold), 'Suggested command');

  if (safety.dangerous) {
    logWarn(`${color.red('Potentially destructive:')} ${safety.reasons.join('; ')}.`);
  }

  // Auto-confirm only when enabled AND the command is not flagged.
  if (behavior.autoConfirmSafe && !safety.dangerous) {
    await runCommand(suggestion.command);
    return { kind: 'done' };
  }

  // Menu loop: Copy returns here; Run/Revise/Cancel exit the loop.
  for (;;) {
    const choice = await selectOption('What next?', [
      { value: 'run', label: 'Run', hint: 'execute in your shell' },
      { value: 'revise', label: 'Revise', hint: 'ask for a different command' },
      { value: 'copy', label: 'Copy', hint: 'copy to clipboard' },
      { value: 'cancel', label: 'Cancel' },
    ]);

    if (isCancel(choice) || choice === 'cancel') return { kind: 'done' };

    if (choice === 'copy') {
      const ok = await copyToClipboard(suggestion.command);
      if (ok) logInfo('Copied to clipboard.');
      else logWarn('No clipboard tool found; copy the command above manually.');
      continue;
    }

    if (choice === 'revise') {
      const feedback = await textPrompt('What should change?', {
        placeholder: 'e.g. use ripgrep instead',
      });
      if (isCancel(feedback)) return { kind: 'done' };
      return { kind: 'revise', feedback: feedback.trim() };
    }

    // choice === 'run'
    if (safety.dangerous) {
      const confirmed = await confirmPrompt(
        `${color.red('This command is flagged as destructive. Run it anyway?')}`,
        false,
      );
      if (isCancel(confirmed)) cancelled();
      if (!confirmed) {
        logInfo('Skipped.');
        continue;
      }
    }
    await runCommand(suggestion.command);
    return { kind: 'done' };
  }
}
