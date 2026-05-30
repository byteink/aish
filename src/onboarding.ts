/**
 * First-run onboarding. Auto-detects a running local provider (Ollama, LM
 * Studio) on localhost, then walks the user through picking a provider and
 * model. Local providers may point at any endpoint URL (LAN, proxy, tunnel)
 * with an optional API key; remote providers require an API key. The result is
 * persisted to ~/.aish.
 */
import {
  type Config,
  type ProviderProfile,
  activeProfile,
  getProfile,
  makeConfig,
  saveConfig,
} from './config.ts';
import {
  DEFAULT_BASE_URLS,
  PROVIDER_LABELS,
  type ProviderConfig,
  type ProviderKind,
  createProvider,
  isRemote,
} from './providers/index.ts';
import { color } from './term.ts';
import { field } from './tui/field.tsx';
import { selectKeyed, selectList } from './tui/select-list.tsx';
import { withStatus } from './tui/status.tsx';
import { cancelled, intro, logInfo, logMessage, logSuccess } from './ui.ts';

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

/**
 * Interactive setup. Saves and returns the new config. When `current` is given
 * (re-running via `/provider`) and the chosen provider matches it, the saved
 * endpoint and API key are reused so the user is not re-asked for credentials
 * they already have.
 */
export async function runOnboarding(current?: Config): Promise<Config> {
  intro(color.cyan('Welcome to aish. Let us get you set up.'));

  const detected = await collectDetected();
  const kind = await chooseProvider(detected);

  // Reuse a saved profile when re-configuring a provider that already exists.
  const known = current ? getProfile(current, kind) : undefined;
  const fresh = isRemote(kind) ? await setupRemote(kind, known) : await setupLocal(kind, known);

  // Merge into the existing config so other providers and behaviour survive;
  // first-run has no current and takes the fresh config as-is. `fresh.provider`
  // stays active and its profile wins for that kind.
  const config = current
    ? {
        ...fresh,
        behavior: current.behavior,
        providers: { ...current.providers, ...fresh.providers },
      }
    : fresh;

  await saveConfig(config);
  logSuccess(
    `Saved config to ~/.aish/config.json, using ${PROVIDER_LABELS[kind]} (${activeProfile(config).model}).`,
  );
  return config;
}

async function collectDetected(): Promise<Detected[]> {
  const detected = await withStatus('Detecting local providers', detectLocalProviders());
  logMessage(
    detected.length > 0
      ? `Found: ${detected.map((d) => PROVIDER_LABELS[d.kind]).join(', ')}`
      : 'No local provider detected',
  );
  return detected;
}

async function chooseProvider(detected: Detected[]): Promise<ProviderKind> {
  const detectedOpts = detected.map((d) => ({
    value: d.kind,
    hint: `detected, ${d.models.length} model(s)`,
  }));
  const localOpts = (['ollama', 'lmstudio'] as ProviderKind[])
    .filter((kind) => !detected.some((d) => d.kind === kind))
    .map((kind) => ({ value: kind, hint: 'local, not detected' }));
  const remoteOpts = (['openai', 'anthropic', 'openrouter'] as ProviderKind[]).map((kind) => ({
    value: kind,
    hint: 'remote, needs API key',
  }));
  const options = [...detectedOpts, ...localOpts, ...remoteOpts].map((o) => ({
    label: `${PROVIDER_LABELS[o.value]} — ${o.hint}`,
    value: o.value,
  }));

  const choice = await selectKeyed('Choose a provider', options);
  if (choice === null) cancelled();
  return choice;
}

async function setupLocal(kind: ProviderKind, known?: ProviderProfile): Promise<Config> {
  // Local providers can live anywhere: prompt for the endpoint (default
  // localhost, or the saved one when re-running) and an optional API key.
  const baseUrl = await promptBaseUrl(kind, known?.baseUrl);
  const apiKey = await promptOptionalKey();

  const model = await pickModel(kind, baseUrl, apiKey);

  const overrides: { baseUrl: string; apiKey?: string } = { baseUrl };
  if (apiKey) overrides.apiKey = apiKey;
  return makeConfig(kind, model, overrides);
}

async function setupRemote(kind: ProviderKind, known?: ProviderProfile): Promise<Config> {
  // Reuse a saved key for the same provider; only ask when there is none.
  const apiKey = known?.apiKey ?? (await promptRemoteKey(kind));
  const baseUrl = known?.baseUrl ?? DEFAULT_BASE_URLS[kind];
  const model = await pickModel(kind, baseUrl, apiKey);
  return makeConfig(kind, model, { apiKey, baseUrl });
}

/** Prompt for a required remote API key, aborting if absent. */
async function promptRemoteKey(kind: ProviderKind): Promise<string> {
  const key = await field(`Enter your ${PROVIDER_LABELS[kind]} API key`, {
    mask: true,
    placeholder: 'sk-…',
  });
  if (key === null) cancelled();
  const apiKey = key.trim();
  if (!apiKey) cancelled('An API key is required for remote providers.');
  return apiKey;
}

/** Prompt for the endpoint URL, pre-filled with the saved or default value. */
async function promptBaseUrl(kind: ProviderKind, saved?: string): Promise<string> {
  const fallback = saved ?? DEFAULT_BASE_URLS[kind];
  const entered = await field('Endpoint URL', { initialValue: fallback, placeholder: fallback });
  if (entered === null) cancelled();
  const url = entered.trim().replace(/\/$/, '');
  return url || fallback;
}

/** Prompt for an optional API key (empty means none). */
async function promptOptionalKey(): Promise<string> {
  const key = await field('API key (optional, press Enter to skip)', { mask: true });
  if (key === null) cancelled();
  return key.trim();
}

/** Fetch the model list from the endpoint with a spinner, then let the user pick. */
async function pickModel(kind: ProviderKind, baseUrl: string, apiKey: string): Promise<string> {
  const config: ProviderConfig = apiKey
    ? { kind, baseUrl, model: '', apiKey }
    : { kind, baseUrl, model: '' };

  let models: string[] = [];
  try {
    models = await withStatus('Fetching models', createProvider(config).listModels());
  } catch {
    logInfo('Could not reach the endpoint to list models. Enter the model name manually.');
  }
  return chooseModel(models);
}

async function chooseModel(models: string[]): Promise<string> {
  if (models.length === 0) {
    const typed = await field('Model name', { placeholder: 'e.g. llama3.1' });
    if (typed === null) cancelled();
    const name = typed.trim();
    if (!name) cancelled('A model name is required.');
    return name;
  }
  const choice = await selectList('Choose a model', models);
  if (choice === null) cancelled();
  return choice;
}
