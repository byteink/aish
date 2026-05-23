/**
 * Interactive harness: a persistent REPL holding a conversation with the model.
 * Each turn either answers conversationally or proposes a command (reusing the
 * shared Ink suggestion frame). The REPL loop lives here in plain logic; every
 * interactive unit — the prompt, the suggestion, the model picker — is a
 * short-lived Ink frame. Slash commands control the session.
 */
import { type Config, saveConfig, toProviderConfig } from './config.ts';
import { type ShellContext, gatherContext } from './context.ts';
import { runSuggestionFlow } from './flow.ts';
import { runOnboarding } from './onboarding.ts';
import { buildInteractivePrompt } from './prompt.ts';
import { type Message, PROVIDER_LABELS, type Provider, createProvider } from './providers/index.ts';
import { color } from './term.ts';
import { promptLine } from './tui/prompt-line.tsx';
import { selectList } from './tui/select-list.tsx';

/** Print one plain transcript line (no clack chrome, to match the Ink frames). */
const say = (msg: string): void => {
  process.stdout.write(`${msg}\n`);
};

const SLASH_HELP = [
  '/exit      end the session (aliases: /quit, /bye)',
  '/clear     clear conversation history',
  '/model     switch model',
  '/provider  switch provider (re-run setup)',
  '/think     toggle model reasoning on/off',
  '/help      show this help',
].join('\n');

export class Session {
  private config: Config;
  private readonly ctx: ShellContext;
  private provider: Provider;
  private messages: Message[];

  constructor(config: Config, ctx: ShellContext) {
    this.config = config;
    this.ctx = ctx;
    this.provider = createProvider(toProviderConfig(config));
    this.messages = [{ role: 'system', content: buildInteractivePrompt(ctx) }];
  }

  /** Run the REPL until the user exits or aborts. */
  async run(): Promise<void> {
    say(color.cyan('aish interactive session'));
    say(color.dim(`${PROVIDER_LABELS[this.config.provider]} · ${this.config.model}`));
    say(color.dim('Type a request, or /help for commands.'));

    for (;;) {
      const input = await promptLine(color.cyan('aish ›'));
      if (input === null) break;
      const line = input.trim();
      if (!line) continue;

      if (line.startsWith('/')) {
        if (!(await this.handleSlash(line))) break;
        continue;
      }
      await this.turn(line);
    }

    say(color.dim('Goodbye.'));
  }

  /**
   * A single conversational turn. The Ink frame owns the revise loop and the
   * Run/Copy/Cancel actions; here we only persist the resulting output.
   */
  private async turn(userText: string): Promise<void> {
    this.messages.push({ role: 'user', content: userText });

    const outcome = await runSuggestionFlow({
      provider: this.provider,
      behavior: this.config.behavior,
      messages: this.messages,
      mode: 'interactive',
    });

    switch (outcome.kind) {
      case 'run':
        // The command (and any failure-fix loop) already executed in the flow.
        return;
      case 'chat':
        say(outcome.message);
        return;
      case 'error':
        say(color.red(outcome.message));
        return;
      case 'cancel':
        return;
    }
  }

  /** Handle a slash command. Returns false when the session should end. */
  private async handleSlash(line: string): Promise<boolean> {
    const cmd = line.split(/\s+/)[0];
    switch (cmd) {
      case '/exit':
      case '/quit':
      case '/bye':
        return false;
      case '/clear':
        this.messages = [{ role: 'system', content: buildInteractivePrompt(this.ctx) }];
        say(color.dim('History cleared.'));
        return true;
      case '/model':
        await this.switchModel();
        return true;
      case '/provider':
        await this.switchProvider();
        return true;
      case '/think':
        await this.toggleThink();
        return true;
      case '/help':
        say(color.dim(SLASH_HELP));
        return true;
      default:
        say(color.yellow(`Unknown command: ${cmd}. Try /help.`));
        return true;
    }
  }

  private async toggleThink(): Promise<void> {
    const think = !this.config.behavior.think;
    this.config = { ...this.config, behavior: { ...this.config.behavior, think } };
    await saveConfig(this.config);
    say(color.dim(`Model reasoning ${think ? 'enabled' : 'disabled'}.`));
  }

  private async switchModel(): Promise<void> {
    let models: string[] = [];
    try {
      models = await this.provider.listModels();
    } catch (err) {
      say(color.red(`Could not list models: ${(err as Error).message}`));
      return;
    }
    if (models.length === 0) {
      say(color.yellow('No models reported by the provider.'));
      return;
    }
    const choice = await selectList('Switch model', models);
    if (choice === null) return;

    this.config = { ...this.config, model: choice };
    this.provider = createProvider(toProviderConfig(this.config));
    await saveConfig(this.config);
    say(color.dim(`Now using ${choice}.`));
  }

  private async switchProvider(): Promise<void> {
    const config = await runOnboarding();
    this.config = config;
    this.provider = createProvider(toProviderConfig(config));
    say(color.dim(`Switched to ${PROVIDER_LABELS[config.provider]} · ${config.model}.`));
  }
}

/** Entry point for interactive mode: ensure config exists, then run the REPL. */
export async function runInteractive(config: Config): Promise<void> {
  const ctx = await gatherContext(config.behavior);
  const session = new Session(config, ctx);
  await session.run();
}
