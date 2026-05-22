/**
 * Gathers environment context for the model: OS, shell, working directory, and
 * (opt-in) recent shell history and git status. Everything beyond os/shell/cwd
 * is privacy-gated by config so nothing sensitive leaves the machine silently.
 */
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { BehaviorConfig } from './config.ts';
import { captureOutput, readText } from './runtime.ts';

const HISTORY_LINES = 10;

export interface ShellContext {
  platform: string;
  shell: string;
  shellName: string;
  cwd: string;
  history?: string[];
  git?: string;
}

const PLATFORM_NAMES: Record<string, string> = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows',
};

/** Absolute path to the user's shell, defaulting to a sane POSIX shell. */
export function detectShell(): string {
  return process.env.SHELL ?? '/bin/sh';
}

export async function gatherContext(behavior: BehaviorConfig): Promise<ShellContext> {
  const shell = detectShell();
  const shellName = basename(shell);
  const cwd = process.cwd();

  const ctx: ShellContext = {
    platform: PLATFORM_NAMES[process.platform] ?? process.platform,
    shell,
    shellName,
    cwd,
  };

  if (behavior.includeHistory) {
    const history = await readRecentHistory(shellName);
    if (history.length > 0) ctx.history = history;
  }

  if (behavior.includeGit) {
    const git = await readGitStatus(shell);
    if (git) ctx.git = git;
  }

  return ctx;
}

/** Render context into a compact block for the system prompt. */
export function formatContext(ctx: ShellContext): string {
  const lines = [`OS: ${ctx.platform}`, `Shell: ${ctx.shellName}`, `Current directory: ${ctx.cwd}`];
  if (ctx.git) lines.push(`Git status:\n${ctx.git}`);
  if (ctx.history && ctx.history.length > 0) {
    lines.push(`Recent commands:\n${ctx.history.join('\n')}`);
  }
  return lines.join('\n');
}

/** Read the tail of the shell's history file, normalising zsh timestamps. */
async function readRecentHistory(shellName: string): Promise<string[]> {
  const file = historyFile(shellName);
  if (!file) return [];

  const raw = await readText(file);
  if (raw === null) return [];

  return raw
    .split('\n')
    .map((line) => line.replace(/^:\s*\d+:\d+;/, '').trim()) // zsh ": <ts>:<dur>;cmd"
    .filter((line) => line.length > 0)
    .slice(-HISTORY_LINES);
}

function historyFile(shellName: string): string | null {
  const home = homedir();
  if (shellName === 'zsh') return process.env.HISTFILE ?? join(home, '.zsh_history');
  if (shellName === 'bash') return process.env.HISTFILE ?? join(home, '.bash_history');
  return null;
}

/** Return a short git summary when inside a work tree, else `undefined`. */
async function readGitStatus(shell: string): Promise<string | undefined> {
  const inside = await captureOutput('git rev-parse --is-inside-work-tree 2>/dev/null', shell);
  if (inside !== 'true') return undefined;
  const status = await captureOutput('git status --short --branch 2>/dev/null', shell);
  return status && status.length > 0 ? status : undefined;
}
