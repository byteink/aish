/**
 * CLI entry. Two primary modes:
 *   ai <request...>   one-shot: natural language -> one command
 *   ai                interactive REPL session
 * Plus `ai config` subcommands.
 *
 * citty treats the first positional of a command with subCommands as a
 * subcommand name and errors on anything unknown, which would clash with our
 * free-text request. So we dispatch on the first token ourselves: `config`
 * runs the config command tree; everything else runs the query command (which
 * has no subCommands, so free text passes through untouched).
 */
import { defineCommand, runMain } from 'citty';
import pkg from '../package.json' with { type: 'json' };
import { type Config, applySetting, configPath, loadConfig, saveConfig } from './config.ts';
import { detectShell } from './context.ts';
import { runOnboarding } from './onboarding.ts';
import { runOneShot } from './oneshot.ts';
import { PROVIDER_LABELS } from './providers/index.ts';
import { runInShell } from './runtime.ts';
import { runInteractive } from './session.ts';
import { color } from './term.ts';
import { logError, logInfo, note } from './ui.ts';

/** First non-flag token, or undefined if there is none. */
function firstPositional(rawArgs: string[]): string | undefined {
  return rawArgs.find((a) => !a.startsWith('-'));
}

/**
 * The request and interactive flows render with Ink, which requires a raw-mode
 * TTY on stdin. Exit with a clear message instead of an Ink stack trace when
 * there is no terminal (piped input, a non-interactive script, or CI).
 */
function requireInteractiveTerminal(): void {
  if (process.stdin.isTTY) return;
  const hint = 'Run it directly in your shell — not through a pipe or a non-interactive script.';
  process.stderr.write(`${color.red('aish needs an interactive terminal.')} ${hint}\n`);
  process.exit(1);
}

/**
 * citty always runs a command's `run` after dispatching to a matched
 * subcommand. This returns true when the first positional names one of the
 * given subcommands, so a parent's default body can bow out.
 */
function dispatchedToSub(rawArgs: string[], subNames: string[]): boolean {
  const first = firstPositional(rawArgs);
  return first !== undefined && subNames.includes(first);
}

/** Load config, running first-run onboarding if none exists. */
async function ensureConfig(): Promise<Config> {
  try {
    const existing = await loadConfig();
    if (existing) return existing;
  } catch (err) {
    logError((err as Error).message);
    process.exit(1);
  }
  return runOnboarding();
}

function redact(config: Config): Record<string, unknown> {
  const view: Record<string, unknown> = { ...config };
  if (config.apiKey) view.apiKey = '••••••••';
  return view;
}

const configSet = defineCommand({
  meta: { name: 'set', description: 'Set a config value (e.g. ai config set model llama3.1)' },
  args: {
    key: { type: 'positional', required: true, description: 'config key' },
    value: { type: 'positional', required: true, description: 'new value' },
  },
  async run({ args }) {
    const config = await ensureConfig();
    try {
      const next = applySetting(config, args.key, args.value);
      await saveConfig(next);
      logInfo(`Set ${args.key}.`);
    } catch (err) {
      logError((err as Error).message);
      process.exit(1);
    }
  },
});

const configEdit = defineCommand({
  meta: { name: 'edit', description: 'Open the config file in $EDITOR' },
  async run() {
    await ensureConfig();
    const editor = process.env.VISUAL ?? process.env.EDITOR ?? 'vi';
    await runInShell(`${editor} ${JSON.stringify(configPath())}`, detectShell());
  },
});

const configPathCmd = defineCommand({
  meta: { name: 'path', description: 'Print the config file path' },
  run() {
    process.stdout.write(`${configPath()}\n`);
  },
});

async function showConfig(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    logInfo('No config yet. Run `ai` to set up.');
    return;
  }
  note(JSON.stringify(redact(config), null, 2), `${PROVIDER_LABELS[config.provider]} config`);
}

const configShow = defineCommand({
  meta: { name: 'get', description: 'Show the current config' },
  run: () => showConfig(),
});

const configCmd = defineCommand({
  meta: { name: 'ai config', description: 'View or edit configuration' },
  subCommands: { get: configShow, set: configSet, edit: configEdit, path: configPathCmd },
  // Bare `ai config` shows the current config; skip when a subcommand handled it.
  run: ({ rawArgs }) => {
    if (dispatchedToSub(rawArgs, ['get', 'set', 'edit', 'path'])) return;
    return showConfig();
  },
});

const queryCmd = defineCommand({
  meta: {
    name: 'ai',
    version: pkg.version,
    description:
      'AI shell assistant that turns natural language into shell commands.\n' +
      'Run `ai` with no arguments for an interactive session, or `ai config` to manage settings.',
  },
  args: {
    request: {
      type: 'positional',
      required: false,
      description: 'natural language request; omit to start an interactive session',
    },
  },
  async run({ rawArgs }) {
    requireInteractiveTerminal();
    const config = await ensureConfig();

    // Everything that is not a flag forms the request. Empty -> interactive.
    const request = rawArgs
      .filter((a) => !a.startsWith('-'))
      .join(' ')
      .trim();
    if (request.length === 0) {
      await runInteractive(config);
      return;
    }
    await runOneShot(request, config);
  },
});

// Dispatch: `config` -> config tree; anything else -> query command.
const argv = process.argv.slice(2);
if (firstPositional(argv) === 'config') {
  const rest = argv.slice(argv.indexOf('config') + 1);
  runMain(configCmd, { rawArgs: rest });
} else {
  runMain(queryCmd, { rawArgs: argv });
}
