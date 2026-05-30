/**
 * Config lives in ~/.aish/config.json at 0600. It records the active provider,
 * behaviour flags, and a `providers` map of every provider the user has
 * configured (endpoint, model, optional key) so they can switch between them
 * without re-entering credentials. The active connection is `providers[provider]`
 * — there is no duplicated top-level copy to drift. All reads validate shape so a
 * hand-edited file can never crash the tool silently.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_BASE_URLS, type ProviderConfig, type ProviderKind } from './providers/index.ts';
import { chmod, ensureDir, readText, writeText } from './runtime.ts';

export interface BehaviorConfig {
  /** Auto-run commands that pass the safety scan, skipping the Run prompt. */
  autoConfirmSafe: boolean;
  /** Show the model's one-line explanation alongside the command. */
  explain: boolean;
  /** Include a snippet of recent shell history in the model context. */
  includeHistory: boolean;
  /** Include `git status` summary when inside a repository. */
  includeGit: boolean;
  /**
   * Ask reasoning-capable models to think before answering. Off is faster and
   * usually enough for command generation; on can help with tricky requests.
   * `<think>` blocks are always stripped from the reply regardless.
   */
  think: boolean;
}

/** A saved provider's connection details, reused when switching back to it. */
export interface ProviderProfile {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface Config {
  provider: ProviderKind;
  behavior: BehaviorConfig;
  /** Every configured provider, keyed by kind. Always includes `provider`. */
  providers: Partial<Record<ProviderKind, ProviderProfile>>;
}

// Derived from the provider registry so a new provider is accepted everywhere
// the moment it is added there — no second list to keep in sync.
const VALID_KINDS: ReadonlySet<string> = new Set<string>(Object.keys(DEFAULT_BASE_URLS));

export const DEFAULT_BEHAVIOR: BehaviorConfig = {
  autoConfirmSafe: false,
  explain: true,
  includeHistory: false,
  includeGit: true,
  think: false,
};

export function configDir(): string {
  return join(homedir(), '.aish');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

/** Load and validate config, or `null` if none exists. Throws on corruption. */
export async function loadConfig(): Promise<Config | null> {
  const raw = await readText(configPath());
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`config at ${configPath()} is not valid JSON`);
  }
  return parseConfig(parsed);
}

/** Persist config, creating ~/.aish at 0700 and the file at 0600. */
export async function saveConfig(config: Config): Promise<void> {
  await ensureDir(configDir(), 0o700);
  await writeText(configPath(), `${JSON.stringify(config, null, 2)}\n`);
  await chmod(configPath(), 0o600);
}

/** The active provider's profile. The active provider is always configured. */
export function activeProfile(config: Config): ProviderProfile {
  const profile = config.providers[config.provider];
  if (!profile) throw new Error(`active provider has no profile: ${config.provider}`);
  return profile;
}

/** Build the `createProvider` input for a saved profile. */
export function profileToProviderConfig(
  kind: ProviderKind,
  profile: ProviderProfile,
): ProviderConfig {
  const base: ProviderConfig = { kind, baseUrl: profile.baseUrl, model: profile.model };
  return profile.apiKey ? { ...base, apiKey: profile.apiKey } : base;
}

/** Map persisted config to what `createProvider` expects. */
export function toProviderConfig(config: Config): ProviderConfig {
  return profileToProviderConfig(config.provider, activeProfile(config));
}

/** Build a fresh config for a chosen provider/model with sane defaults. */
export function makeConfig(
  kind: ProviderKind,
  model: string,
  overrides?: { baseUrl?: string; apiKey?: string },
): Config {
  const profile: ProviderProfile = {
    baseUrl: overrides?.baseUrl ?? DEFAULT_BASE_URLS[kind],
    model,
  };
  if (overrides?.apiKey) profile.apiKey = overrides.apiKey;
  return { provider: kind, behavior: { ...DEFAULT_BEHAVIOR }, providers: { [kind]: profile } };
}

/** Configured provider kinds, the active one first, then alphabetical. */
export function listProviders(config: Config): ProviderKind[] {
  return (Object.keys(config.providers) as ProviderKind[]).sort((a, b) => {
    if (a === config.provider) return -1;
    if (b === config.provider) return 1;
    return a.localeCompare(b);
  });
}

export function getProfile(config: Config, kind: ProviderKind): ProviderProfile | undefined {
  return config.providers[kind];
}

/** Replace the active provider's profile. */
function setActiveProfile(config: Config, profile: ProviderProfile): Config {
  return { ...config, providers: { ...config.providers, [config.provider]: profile } };
}

/**
 * Switch the active provider to a previously configured `kind`, recording the
 * given model on its profile. Behaviour and other profiles are preserved.
 * Throws if the provider was never configured.
 */
export function activate(config: Config, kind: ProviderKind, model: string): Config {
  const profile = config.providers[kind];
  if (!profile) throw new Error(`provider not configured: ${kind}`);
  return {
    ...config,
    provider: kind,
    providers: { ...config.providers, [kind]: { ...profile, model } },
  };
}

const BEHAVIOR_PREFIX = 'behavior.';
// Every behaviour flag is a boolean, so they share one setter path. Derived
// from DEFAULT_BEHAVIOR: adding a flag there makes it settable here for free.
function isBehaviorKey(key: string): key is keyof BehaviorConfig {
  return Object.hasOwn(DEFAULT_BEHAVIOR, key);
}

/**
 * Apply a dotted `key=value` setting (e.g. `behavior.explain=false`) to a
 * config, returning the updated copy. `model`/`baseUrl`/`apiKey` edit the active
 * provider's profile; `provider` switches to an already-configured one (adding a
 * provider is the interactive `/provider` flow's job, not a blind field write).
 */
export function applySetting(config: Config, key: string, value: string): Config {
  if (key.startsWith(BEHAVIOR_PREFIX)) {
    const flag = key.slice(BEHAVIOR_PREFIX.length);
    if (!isBehaviorKey(flag)) throw new Error(`unknown config key: ${key}`);
    return { ...config, behavior: { ...config.behavior, [flag]: parseBool(value, key) } };
  }

  switch (key) {
    case 'provider': {
      if (!VALID_KINDS.has(value)) throw new Error(`invalid provider: ${value}`);
      const profile = config.providers[value as ProviderKind];
      if (!profile) throw new Error(`provider not configured: ${value}`);
      return activate(config, value as ProviderKind, profile.model);
    }
    case 'baseUrl':
      return setActiveProfile(config, { ...activeProfile(config), baseUrl: value });
    case 'model':
      return setActiveProfile(config, { ...activeProfile(config), model: value });
    case 'apiKey':
      return setActiveProfile(config, { ...activeProfile(config), apiKey: value });
    default:
      throw new Error(`unknown config key: ${key}`);
  }
}

function parseBool(value: string, key: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} expects true or false, got "${value}"`);
}

/**
 * Validate and normalise parsed JSON into a `Config`, migrating a legacy
 * single-provider file. Throws on anything it cannot safely repair.
 */
export function parseConfig(input: unknown): Config {
  if (typeof input !== 'object' || input === null) {
    throw new Error('config must be a JSON object');
  }
  const obj = input as Record<string, unknown>;

  if (typeof obj.provider !== 'string' || !VALID_KINDS.has(obj.provider)) {
    throw new Error(`config.provider is missing or invalid: ${String(obj.provider)}`);
  }
  const provider = obj.provider as ProviderKind;

  const providers = parseProviders(obj.providers);
  // Migrate a pre-`providers` file: its single connection lived in top-level
  // baseUrl/model/apiKey fields, which become the active provider's profile.
  if (!providers[provider]) {
    const legacy = legacyProfile(obj);
    if (legacy) providers[provider] = legacy;
  }
  if (!providers[provider]) {
    throw new Error(`config.provider "${provider}" has no saved profile`);
  }

  const behavior = (obj.behavior ?? {}) as Record<string, unknown>;
  return {
    provider,
    behavior: {
      autoConfirmSafe: asBool(behavior.autoConfirmSafe, DEFAULT_BEHAVIOR.autoConfirmSafe),
      explain: asBool(behavior.explain, DEFAULT_BEHAVIOR.explain),
      includeHistory: asBool(behavior.includeHistory, DEFAULT_BEHAVIOR.includeHistory),
      includeGit: asBool(behavior.includeGit, DEFAULT_BEHAVIOR.includeGit),
      think: asBool(behavior.think, DEFAULT_BEHAVIOR.think),
    },
    providers,
  };
}

/** A profile from a legacy single-provider file's top-level fields, if valid. */
function legacyProfile(obj: Record<string, unknown>): ProviderProfile | undefined {
  if (typeof obj.baseUrl !== 'string' || obj.baseUrl.length === 0) return undefined;
  if (typeof obj.model !== 'string' || obj.model.length === 0) return undefined;
  const profile: ProviderProfile = { baseUrl: obj.baseUrl, model: obj.model };
  if (typeof obj.apiKey === 'string') profile.apiKey = obj.apiKey;
  return profile;
}

/** Validate the saved `providers` map, dropping any malformed entry. */
function parseProviders(input: unknown): Partial<Record<ProviderKind, ProviderProfile>> {
  const out: Partial<Record<ProviderKind, ProviderProfile>> = {};
  if (typeof input !== 'object' || input === null) return out;
  for (const [kind, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!VALID_KINDS.has(kind) || typeof raw !== 'object' || raw === null) continue;
    const p = raw as Record<string, unknown>;
    if (typeof p.baseUrl !== 'string' || typeof p.model !== 'string') continue;
    const profile: ProviderProfile = { baseUrl: p.baseUrl, model: p.model };
    if (typeof p.apiKey === 'string') profile.apiKey = p.apiKey;
    out[kind as ProviderKind] = profile;
  }
  return out;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
