/**
 * First-run onboarding. Auto-detects a running local provider (Ollama, LM
 * Studio), and walks the user through picking a provider and model. Remote
 * providers prompt for an API key. The result is persisted to ~/.aish.
 */
import { type Config, makeConfig, saveConfig } from './config.ts';
import {
  DEFAULT_BASE_URLS,
  PROVIDER_LABELS,
  type ProviderKind,
  createProvider,
} from './providers/index.ts';
import {
  cancelled,
  color,
  intro,
  isCancel,
  logInfo,
  logSuccess,
  passwordPrompt,
  selectOption,
  textPrompt,
} from './ui.ts';

const DETECT_TIMEOUT_MS = 1500;
const LOCAL_KINDS: ProviderKind[] = ['ollama', 'lmstudio'];

interface Detected {
  kind: ProviderKind;
  models: string[];
}

/** Probe local providers in parallel; return those that respond. */
export async function detectLocalProviders(): Promise<Detected[]> {
  const probes = LOCAL_KINDS.map(async (kind) => {
    const models = await probe(DEFAULT_BASE_URLS[kind]);
    return models ? { kind, models } : null;
  });
  return (await Promise.all(probes)).filter((d): d is Detected => d !== null);
}

async function probe(baseUrl: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      signal: AbortSignal.timeout(DETECT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    return (json.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string')
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}

/** Interactive first-run setup. Saves and returns the new config. */
export async function runOnboarding(): Promise<Config> {
  intro(color.cyan('Welcome to aish. Let us get you set up.'));

  const detected = await collectDetected();
  const kind = await chooseProvider(detected);

  const config =
    kind === 'openai' || kind === 'anthropic'
      ? await setupRemote(kind)
      : await setupLocal(kind, detected.find((d) => d.kind === kind)?.models ?? []);

  await saveConfig(config);
  logSuccess(
    `Saved config to ~/.aish/config.json, using ${PROVIDER_LABELS[kind]} (${config.model}).`,
  );
  return config;
}

async function collectDetected(): Promise<Detected[]> {
  const spin = await import('@clack/prompts').then((m) => m.spinner());
  spin.start('Detecting local providers');
  const detected = await detectLocalProviders();
  spin.stop(
    detected.length > 0
      ? `Found: ${detected.map((d) => PROVIDER_LABELS[d.kind]).join(', ')}`
      : 'No local provider detected',
  );
  return detected;
}

async function chooseProvider(detected: Detected[]): Promise<ProviderKind> {
  const options: Array<{ value: ProviderKind; label: string; hint?: string }> = [];
  for (const d of detected) {
    options.push({
      value: d.kind,
      label: PROVIDER_LABELS[d.kind],
      hint: `detected, ${d.models.length} model(s)`,
    });
  }
  for (const kind of ['ollama', 'lmstudio'] as ProviderKind[]) {
    if (!detected.some((d) => d.kind === kind)) {
      options.push({ value: kind, label: PROVIDER_LABELS[kind], hint: 'local, not detected' });
    }
  }
  options.push({ value: 'openai', label: PROVIDER_LABELS.openai, hint: 'remote, needs API key' });
  options.push({
    value: 'anthropic',
    label: PROVIDER_LABELS.anthropic,
    hint: 'remote, needs API key',
  });

  const choice = await selectOption('Choose a provider', options);
  if (isCancel(choice)) cancelled();
  return choice;
}

async function setupLocal(kind: ProviderKind, models: string[]): Promise<Config> {
  const model = await chooseModel(models);
  return makeConfig(kind, model);
}

async function setupRemote(kind: ProviderKind): Promise<Config> {
  const key = await passwordPrompt(`Enter your ${PROVIDER_LABELS[kind]} API key`);
  if (isCancel(key)) cancelled();
  const apiKey = key.trim();
  if (!apiKey) cancelled('An API key is required for remote providers.');

  const baseUrl = DEFAULT_BASE_URLS[kind];
  const config = makeConfig(kind, '', { apiKey });

  // Try to list models so the user can pick; fall back to manual entry.
  let models: string[] = [];
  const spin = await import('@clack/prompts').then((m) => m.spinner());
  spin.start('Fetching models');
  try {
    const provider = createProvider({ kind, baseUrl, model: '', apiKey });
    models = await provider.listModels();
    spin.stop(`Found ${models.length} model(s)`);
  } catch {
    spin.stop('Could not list models');
    logInfo('Enter the model name manually.');
  }

  config.model = await chooseModel(models);
  return config;
}

async function chooseModel(models: string[]): Promise<string> {
  if (models.length === 0) {
    const typed = await textPrompt('Model name', 'e.g. llama3.1');
    if (isCancel(typed)) cancelled();
    const name = typed.trim();
    if (!name) cancelled('A model name is required.');
    return name;
  }
  const choice = await selectOption(
    'Choose a model',
    models.map((m) => ({ value: m, label: m })),
  );
  if (isCancel(choice)) cancelled();
  return choice;
}
