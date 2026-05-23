/**
 * Interactive harness: a persistent REPL holding a conversation with the model.
 * Each turn either answers conversationally or proposes a command (reusing the
 * shared Run/Revise/Copy/Cancel flow). Slash commands control the session.
 */
import { type Config, saveConfig, toProviderConfig } from './config.ts';
import { type ShellContext, gatherContext } from './context.ts';
import { presentSuggestion } from './flow.ts';
import { runOnboarding } from './onboarding.ts';
import { buildInteractivePrompt, completionLabel, parseReply } from './prompt.ts';
import { type Message, PROVIDER_LABELS, type Provider, createProvider } from './providers/index.ts';
import {
  collectWithSpinner,
  color,
  intro,
  isCancel,
  logError,
  logInfo,
  logMessage,
  logWarn,
  outro,
  selectOption,
  textPrompt,
} from './ui.ts';

const MAX_REVISIONS = 20;

const SLASH_HELP = [
  '/exit      end the session',
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
    intro(color.cyan('aish interactive session'));
    logInfo(
      `${PROVIDER_LABELS[this.config.provider]} · ${this.config.model}\n` +
        `${color.dim('Type a request, or /help for commands.')}`,
    );

    for (;;) {
      const input = await textPrompt('aish ›');
      if (isCancel(input)) break;
      const line = input.trim();
      if (!line) continue;

      if (line.startsWith('/')) {
        if (!(await this.handleSlash(line))) break;
        continue;
      }
      await this.turn(line);
    }

    outro('Goodbye.');
  }

  /** A single conversational turn, looping while the user revises a command. */
  private async turn(userText: string): Promise<void> {
    this.messages.push({ role: 'user', content: userText });

    for (let i = 0; i < MAX_REVISIONS; i++) {
      let raw: string;
      try {
        raw = await collectWithSpinner(
          this.provider.chat(this.messages, { think: this.config.behavior.think }),
          'Thinking',
          (full) => color.dim(completionLabel(full, 'interactive', this.config.behavior.explain)),
        );
      } catch (err) {
        logError(`Generation failed: ${(err as Error).message}`);
        return;
      }
      this.messages.push({ role: 'assistant', content: raw });

      const reply = parseReply(raw, 'interactive');
      if (reply.type === 'chat') {
        logMessage(reply.message);
        return;
      }

      const outcome = await presentSuggestion(reply, this.config.behavior);
      if (outcome.kind === 'done') return;
      this.messages.push({ role: 'user', content: `Revise the command: ${outcome.feedback}` });
    }

    logWarn('Too many revisions; ending this turn.');
  }

  /** Handle a slash command. Returns false when the session should end. */
  private async handleSlash(line: string): Promise<boolean> {
    const cmd = line.split(/\s+/)[0];
    switch (cmd) {
      case '/exit':
      case '/quit':
        return false;
      case '/clear':
        this.messages = [{ role: 'system', content: buildInteractivePrompt(this.ctx) }];
        logInfo('History cleared.');
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
        logInfo(SLASH_HELP);
        return true;
      default:
        logWarn(`Unknown command: ${cmd}. Try /help.`);
        return true;
    }
  }

  private async toggleThink(): Promise<void> {
    const think = !this.config.behavior.think;
    this.config = { ...this.config, behavior: { ...this.config.behavior, think } };
    await saveConfig(this.config);
    logInfo(`Model reasoning ${think ? 'enabled' : 'disabled'}.`);
  }

  private async switchModel(): Promise<void> {
    let models: string[] = [];
    try {
      models = await this.provider.listModels();
    } catch (err) {
      logError(`Could not list models: ${(err as Error).message}`);
      return;
    }
    if (models.length === 0) {
      logWarn('No models reported by the provider.');
      return;
    }
    const choice = await selectOption(
      'Switch model',
      models.map((m) => ({ value: m, label: m })),
    );
    if (isCancel(choice)) return;

    this.config = { ...this.config, model: choice };
    this.provider = createProvider(toProviderConfig(this.config));
    await saveConfig(this.config);
    logInfo(`Now using ${choice}.`);
  }

  private async switchProvider(): Promise<void> {
    const config = await runOnboarding();
    this.config = config;
    this.provider = createProvider(toProviderConfig(config));
    logInfo(`Switched to ${PROVIDER_LABELS[config.provider]} · ${config.model}.`);
  }
}

/** Entry point for interactive mode: ensure config exists, then run the REPL. */
export async function runInteractive(config: Config): Promise<void> {
  const ctx = await gatherContext(config.behavior);
  const session = new Session(config, ctx);
  await session.run();
}
