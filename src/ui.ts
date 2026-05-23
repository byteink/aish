/**
 * Thin adapter over @clack/prompts: the prompt and log primitives used by
 * first-run onboarding and top-level CLI messages. Pure terminal utilities
 * (colour, width, wrapping) live in ./term.ts so the Ink frames can share them.
 */
import * as p from '@clack/prompts';
import type { Option } from '@clack/prompts';
import { wrap } from './term.ts';

export const intro = (msg: string): void => p.intro(msg);
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
