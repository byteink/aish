/**
 * Thin UI layer over @clack/prompts plus a NO_COLOR-aware colour helper and a
 * spinner that drives a streaming generation to completion. Keeping all
 * presentation here means the flows read as plain logic.
 */
import * as p from '@clack/prompts';
import type { Option } from '@clack/prompts';

const COLOR_ENABLED =
  !process.env.NO_COLOR && process.stdout.isTTY === true && process.env.TERM !== 'dumb';

function paint(open: number, close: number): (s: string) => string {
  return COLOR_ENABLED ? (s) => `\x1b[${open}m${s}\x1b[${close}m` : (s) => s;
}

export const color = {
  bold: paint(1, 22),
  dim: paint(2, 22),
  red: paint(31, 39),
  green: paint(32, 39),
  yellow: paint(33, 39),
  cyan: paint(36, 39),
};

// clack frames every line with a "│  " gutter and the box border, so reserve a
// few columns. Floor keeps things sane on absurdly narrow terminals.
const GUTTER = 6;
const MIN_WIDTH = 24;
const FALLBACK_WIDTH = 80;

/** Current terminal width, or a sane default when not attached to a TTY. */
export function terminalColumns(): number {
  const cols = process.stdout.columns;
  return cols && cols > 0 ? cols : FALLBACK_WIDTH;
}

/**
 * Word-wrap text to the terminal width, preserving existing line breaks and
 * hard-breaking tokens longer than the line (e.g. URLs or long flags). Used to
 * keep clack boxes and messages inside the actual terminal.
 */
export function wrap(text: string, width = terminalColumns() - GUTTER): string {
  const limit = Math.max(MIN_WIDTH, width);
  return text
    .split('\n')
    .map((line) => wrapLine(line, limit))
    .join('\n');
}

function wrapLine(line: string, limit: number): string {
  if (line.length <= limit) return line;
  const out: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current) out.push(current);
    current = '';
  };
  for (const word of line.split(/\s+/)) {
    if (!word) continue;
    if (word.length > limit) {
      flush();
      for (let i = 0; i < word.length; i += limit) out.push(word.slice(i, i + limit));
      continue;
    }
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= limit) {
      current += ` ${word}`;
    } else {
      flush();
      current = word;
    }
  }
  flush();
  return out.join('\n');
}

/** Apply a colour function to each line independently (keeps ANSI per line). */
export function paintLines(text: string, paint: (s: string) => string): string {
  return text.split('\n').map(paint).join('\n');
}

export const intro = (msg: string): void => p.intro(msg);
export const outro = (msg: string): void => p.outro(msg);
export const note = (body: string, title?: string): void => p.note(body, title);
export const logInfo = (msg: string): void => p.log.info(wrap(msg));
export const logWarn = (msg: string): void => p.log.warn(wrap(msg));
export const logError = (msg: string): void => p.log.error(wrap(msg));
export const logSuccess = (msg: string): void => p.log.success(wrap(msg));
export const logMessage = (msg: string): void => p.log.message(wrap(msg));

/** True when the user aborted a prompt (Ctrl-C / Esc). */
export const isCancel = p.isCancel;

export function cancelled(msg = 'Cancelled.'): never {
  p.cancel(msg);
  process.exit(130);
}

export async function selectOption<T extends string>(
  message: string,
  options: Array<{ value: T; label: string; hint?: string }>,
): Promise<T | symbol> {
  // clack's Option is a conditional type over the generic, which won't unify
  // with our concrete element type; the cast is the documented escape hatch.
  return p.select<T>({ message, options: options as Option<T>[] });
}

export interface TextOpts {
  placeholder?: string;
  /** Pre-filled, editable value. */
  initialValue?: string;
  /** Value used when the field is submitted empty. */
  defaultValue?: string;
}

export async function textPrompt(message: string, opts: TextOpts = {}): Promise<string | symbol> {
  return p.text({ message, ...opts });
}

/** A clack spinner instance (start/stop). */
export const spinner = (): ReturnType<typeof p.spinner> => p.spinner();

export async function passwordPrompt(message: string): Promise<string | symbol> {
  return p.password({ message });
}

export async function confirmPrompt(
  message: string,
  initialValue = false,
): Promise<boolean | symbol> {
  return p.confirm({ message, initialValue });
}

/**
 * Drive a text-chunk generator to completion behind a spinner, returning the
 * full concatenated text. Streaming happens at the transport layer; the user
 * sees a live "thinking" indicator while tokens are collected.
 */
export async function collectWithSpinner(
  gen: AsyncGenerator<string, void, unknown>,
  message = 'Thinking',
  done: (full: string) => string = () => 'Done',
): Promise<string> {
  const spin = p.spinner();
  spin.start(message);
  let full = '';
  try {
    for await (const chunk of gen) full += chunk;
    spin.stop(done(full));
    return full;
  } catch (err) {
    spin.stop('Failed', 1);
    throw err;
  }
}
