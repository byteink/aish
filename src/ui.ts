/**
 * Terminal output primitives: coloured log lines and the cancellation signal
 * shared by onboarding and the top-level CLI. Pure stdout writes with no prompt
 * library, so the Ink frames remain the single owner of stdin — the source of
 * the old clack/Ink raw-mode handoff bugs.
 */
import { color, wrap } from './term.ts';

/** Write one line to stdout. The single output primitive for plain transcript text. */
export const write = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

/**
 * Raised when the user aborts a prompt (Ctrl-C / Esc) or omits a required
 * value during onboarding. Throwing — rather than exiting — lets the caller
 * decide: first-run setup exits the process, but `/provider` mid-session just
 * returns to the REPL with the previous provider intact.
 */
export class Cancelled extends Error {}

export function cancelled(msg = 'Cancelled.'): never {
  throw new Cancelled(msg);
}

export const intro = (msg: string): void => write(`\n${msg}`);
export const logInfo = (msg: string): void => write(color.cyan(wrap(msg)));
export const logError = (msg: string): void => write(color.red(wrap(msg)));
export const logSuccess = (msg: string): void => write(color.green(wrap(msg)));
export const logMessage = (msg: string): void => write(wrap(msg));

/** A titled block of text (e.g. the config dump from `ai config`). */
export const note = (body: string, title?: string): void => {
  if (title) write(color.bold(title));
  write(body);
};

/** Dim notice printed when first-run setup is cancelled. */
export const cancelNote = (msg: string): void => write(color.dim(msg));
