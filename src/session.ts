/**
 * Interactive harness: a persistent REPL holding a conversation with the model.
 * Each turn either answers conversationally or proposes a command (reusing the
 * shared Ink suggestion frame). The REPL loop lives here in plain logic; every
 * interactive unit — the prompt, the suggestion, the model picker — is a
 * short-lived Ink frame. Slash commands control the session.
 */
import { helpText } from './commands.ts';
import {
  type Config,
  type ProviderProfile,
  activate,
  activeProfile,
  getProfile,
  listProviders,
  profileToProviderConfig,
  saveConfig,
  toProviderConfig,
} from './config.ts';
import { type ShellContext, gatherContext } from './context.ts';
import { runSuggestionFlow } from './flow.ts';
import { runOnboarding } from './onboarding.ts';
import { buildInteractivePrompt } from './prompt.ts';
import {
  type Message,
  PROVIDER_LABELS,
  type Provider,
  type ProviderKind,
  createProvider,
} from './providers/index.ts';
import { color } from './term.ts';
import { promptLine } from './tui/prompt-line.tsx';
import { selectKeyed, selectList } from './tui/select-list.tsx';
import { withStatus } from './tui/status.tsx';
import { Cancelled, write as say } from './ui.ts';

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
    say(
      color.dim(`${PROVIDER_LABELS[this.config.provider]} · ${activeProfile(this.config).model}`),
    );
    say(color.dim('Type a request, or /help for commands.'));

    for (;;) {
      const input = await promptLine(color.cyan('aish ›'), { commands: true });
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
        say(color.dim(helpText()));
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

    this.config = activate(this.config, this.config.provider, choice);
    this.provider = createProvider(toProviderConfig(this.config));
    await saveConfig(this.config);
    say(color.dim(`Now using ${choice}.`));
  }

  /** List configured providers for a quick switch, plus an "add" action. */
  private async switchProvider(): Promise<void> {
    const options: Array<{ label: string; value: ProviderKind | 'add' }> = listProviders(
      this.config,
    ).map((kind) => ({ label: this.providerItem(kind), value: kind }));
    options.push({ label: 'Add a provider…', value: 'add' });

    const choice = await selectKeyed('Switch provider', options);
    if (choice === null) return;
    if (choice === 'add') return this.addProvider();
    await this.activateProvider(choice);
  }

  /** A menu line for a configured provider: label, last model, active marker. */
  private providerItem(kind: ProviderKind): string {
    const model = getProfile(this.config, kind)?.model ?? '';
    const active = kind === this.config.provider ? ' (active)' : '';
    return `${PROVIDER_LABELS[kind]} · ${model}${active}`;
  }

  /** Switch to a configured provider, then pick its model. */
  private async activateProvider(kind: ProviderKind): Promise<void> {
    const profile = getProfile(this.config, kind);
    if (!profile) return;

    // Switch even when the endpoint is unreachable: fall back to the saved
    // model so a temporarily-down provider can still be selected.
    const models = await this.modelsFor(kind, profile);
    let model = profile.model;
    if (models.length > 0) {
      const choice = await selectList(`Model for ${PROVIDER_LABELS[kind]}`, models);
      if (choice === null) return;
      model = choice;
    }

    this.config = activate(this.config, kind, model);
    this.provider = createProvider(toProviderConfig(this.config));
    await saveConfig(this.config);
    say(color.dim(`Now using ${PROVIDER_LABELS[kind]} · ${model}.`));
  }

  /** List a provider's models, or [] (with a notice) if the endpoint fails. */
  private async modelsFor(kind: ProviderKind, profile: ProviderProfile): Promise<string[]> {
    const provider = createProvider(profileToProviderConfig(kind, profile));
    try {
      return await withStatus('Fetching models', provider.listModels());
    } catch (err) {
      say(
        color.yellow(
          `Could not list models (${(err as Error).message}); keeping ${profile.model}.`,
        ),
      );
      return [];
    }
  }

  /** Run onboarding to configure a new (or replacement) provider. */
  private async addProvider(): Promise<void> {
    try {
      this.config = await runOnboarding(this.config);
      this.provider = createProvider(toProviderConfig(this.config));
      const { provider } = this.config;
      say(
        color.dim(
          `Switched to ${PROVIDER_LABELS[provider]} · ${activeProfile(this.config).model}.`,
        ),
      );
    } catch (err) {
      // Aborting setup mid-session keeps the current provider; only first-run
      // onboarding treats a cancel as fatal.
      if (err instanceof Cancelled) return say(color.dim('Provider unchanged.'));
      throw err;
    }
  }
}

/** Entry point for interactive mode: ensure config exists, then run the REPL. */
export async function runInteractive(config: Config): Promise<void> {
  const ctx = await gatherContext(config.behavior);
  const session = new Session(config, ctx);
  await session.run();
}
