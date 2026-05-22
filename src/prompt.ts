/**
 * Builds the system prompts and parses the model's reply. The model is asked to
 * return a strict JSON object so the distinction between "run this command" and
 * "here is an answer" is deterministic rather than guessed from prose.
 */
import { type ShellContext, formatContext } from './context.ts';

export interface CommandSuggestion {
  type: 'command';
  command: string;
  explanation: string;
}

export interface ChatReply {
  type: 'chat';
  message: string;
}

export type ModelReply = CommandSuggestion | ChatReply;

export function buildOneShotPrompt(ctx: ShellContext): string {
  return [
    'You are aish, an AI shell assistant. Convert the user request into ONE shell',
    "command that is idiomatic to the user's OS and shell.",
    '',
    'Respond with ONLY a JSON object, no markdown, no code fences, no prose:',
    '{"command": "<single command>", "explanation": "<one short sentence>"}',
    '',
    'Rules:',
    '- Exactly one command. Combine steps with pipes, && or ; if needed.',
    '- Use tools that exist on the stated OS and shell.',
    '- Never include a leading $ or shell prompt.',
    '- The explanation is one short sentence describing what the command does.',
    '',
    'Environment:',
    formatContext(ctx),
  ].join('\n');
}

export function buildInteractivePrompt(ctx: ShellContext): string {
  return [
    'You are aish, an interactive AI shell assistant. Keep a helpful conversation.',
    'For each user turn, choose ONE of:',
    '',
    '1. A shell command, when the user wants an action performed:',
    '   {"type": "command", "command": "<single command>", "explanation": "<one short sentence>"}',
    '2. A conversational answer otherwise:',
    '   {"type": "chat", "message": "<your reply>"}',
    '',
    'Respond with ONLY the JSON object: no markdown, no code fences, no extra text.',
    'Commands must be idiomatic to the stated OS and shell and contain exactly one command.',
    '',
    'Environment:',
    formatContext(ctx),
  ].join('\n');
}

/**
 * Parse a model reply into a structured result. Tolerates code fences and
 * surrounding prose; falls back to treating the text as a command (one-shot)
 * or a chat message (interactive) when it is not valid JSON.
 */
export function parseReply(raw: string, mode: 'oneshot' | 'interactive'): ModelReply {
  // Drop reasoning models' <think> blocks before anything else, so their
  // contents never leak into the command/explanation or break extraction.
  const cleaned = stripFences(stripThinking(raw));

  // Weak models often emit a valid object surrounded by prose, or several
  // objects. Take the first balanced object that yields a command or message.
  for (const obj of extractJsonObjects(cleaned)) {
    const reply = interpretJson(obj);
    if (reply) return reply;
  }

  // Fallback: the model did not return the JSON contract. In interactive mode
  // we just show the prose. In one-shot mode we only accept it as a command
  // when it is a single short line; otherwise it is almost certainly rambling
  // prose, and treating that as an executable command (and possibly auto-
  // running it) would be unsafe, so we surface it as a message instead.
  const text = cleaned.trim();
  if (mode === 'interactive') return { type: 'chat', message: text };
  if (looksLikeCommand(text)) {
    return { type: 'command', command: text, explanation: 'No explanation provided.' };
  }
  return { type: 'chat', message: text };
}

const MAX_COMMAND_LENGTH = 300;

function looksLikeCommand(text: string): boolean {
  return text.length > 0 && text.length <= MAX_COMMAND_LENGTH && !text.includes('\n');
}

/** Map a parsed JSON object to a reply, or null if it carries neither field. */
function interpretJson(json: RawJson): ModelReply | null {
  const command = typeof json.command === 'string' ? json.command.trim() : '';
  const explanation = typeof json.explanation === 'string' ? json.explanation.trim() : '';
  const message = typeof json.message === 'string' ? json.message.trim() : '';

  if (json.type === 'chat' && message) return { type: 'chat', message };
  if (command) {
    return { type: 'command', command, explanation: explanation || 'No explanation provided.' };
  }
  if (message) return { type: 'chat', message };
  return null;
}

interface RawJson {
  type?: unknown;
  command?: unknown;
  explanation?: unknown;
  message?: unknown;
}

/**
 * Extract every top-level balanced `{...}` object from the text, in order,
 * returning those that parse as JSON. Brace matching ignores braces inside
 * strings, so commands containing `{}` do not confuse it. Bounded by the
 * length of the input.
 */
function extractJsonObjects(text: string): RawJson[] {
  const objects: RawJson[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '{') {
      i++;
      continue;
    }
    const end = matchBrace(text, i);
    if (end === -1) break; // no closing brace from here on
    try {
      objects.push(JSON.parse(text.slice(i, end + 1)) as RawJson);
    } catch {
      // Not valid JSON (e.g. a `{}` inside prose); skip past it.
    }
    i = end + 1;
  }
  return objects;
}

/** Index of the `}` closing the `{` at `start`, or -1 if unbalanced. */
function matchBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

function stripFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim();
}

/**
 * Remove reasoning blocks emitted by thinking models. Handles a closed
 * `<think>...</think>` (or `<thinking>`) as well as an unterminated trailing
 * block (model cut off mid-thought).
 */
function stripThinking(raw: string): string {
  return raw
    .replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(think|thinking)>[\s\S]*$/i, '')
    .trim();
}
