/**
 * Executes a confirmed command in the user's shell, streaming output live by
 * inheriting stdio. Returns the exit code so callers can surface failures.
 */
import { detectShell } from './context.ts';
import { type ShellRunResult, runInShellCapture } from './runtime.ts';
import { color } from './term.ts';
import { logError } from './ui.ts';

/** Run a command, streaming its output live and returning the exit code plus
 *  the captured transcript (for feeding back to the model). */
export async function runCommand(command: string): Promise<ShellRunResult> {
  const shell = detectShell();
  // Echo the command so terminal scrollback shows what produced the output.
  process.stdout.write(`${color.dim('$')} ${command}\n`);

  const result = await runInShellCapture(command, shell);

  // Stay quiet on success; the command's own output is the result. Only flag a
  // non-zero exit, which the user might otherwise miss.
  if (result.code !== 0) logError(`Command exited with code ${result.code}.`);
  return result;
}
