/**
 * Executes a confirmed command in the user's shell, streaming output live by
 * inheriting stdio. Returns the exit code so callers can surface failures.
 */
import { detectShell } from './context.ts';
import { runInShell } from './runtime.ts';
import { color, logError, logSuccess } from './ui.ts';

export async function runCommand(command: string): Promise<number> {
  const shell = detectShell();
  // Echo the command so terminal scrollback shows what produced the output.
  process.stdout.write(`${color.dim('$')} ${command}\n`);

  const code = await runInShell(command, shell);

  if (code === 0) logSuccess('Command finished.');
  else logError(`Command exited with code ${code}.`);
  return code;
}
