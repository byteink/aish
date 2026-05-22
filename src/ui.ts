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

export const intro = (msg: string): void => p.intro(msg);
export const outro = (msg: string): void => p.outro(msg);
export const note = (body: string, title?: string): void => p.note(body, title);
export const logInfo = (msg: string): void => p.log.info(msg);
export const logWarn = (msg: string): void => p.log.warn(msg);
export const logError = (msg: string): void => p.log.error(msg);
export const logSuccess = (msg: string): void => p.log.success(msg);
export const logMessage = (msg: string): void => p.log.message(msg);

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

export async function textPrompt(message: string, placeholder?: string): Promise<string | symbol> {
  return p.text(placeholder ? { message, placeholder } : { message });
}

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
): Promise<string> {
  const spin = p.spinner();
  spin.start(message);
  let full = '';
  try {
    for await (const chunk of gen) full += chunk;
    spin.stop('Done');
    return full;
  } catch (err) {
    spin.stop('Failed', 1);
    throw err;
  }
}
