/**
 * Config lives in ~/.aish/config.json at 0600. It records the active provider,
 * endpoint, model, optional API key, and behaviour flags. All reads validate
 * shape so a hand-edited file can never crash the tool silently.
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

export interface Config {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  behavior: BehaviorConfig;
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
  return validate(parsed);
}

/** Persist config, creating ~/.aish at 0700 and the file at 0600. */
export async function saveConfig(config: Config): Promise<void> {
  await ensureDir(configDir(), 0o700);
  await writeText(configPath(), `${JSON.stringify(config, null, 2)}\n`);
  await chmod(configPath(), 0o600);
}

/** Map persisted config to what `createProvider` expects. */
export function toProviderConfig(config: Config): ProviderConfig {
  const base: ProviderConfig = {
    kind: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
  };
  return config.apiKey ? { ...base, apiKey: config.apiKey } : base;
}

/** Build a fresh config for a chosen provider/model with sane defaults. */
export function makeConfig(
  kind: ProviderKind,
  model: string,
  overrides?: Partial<Pick<Config, 'baseUrl' | 'apiKey'>>,
): Config {
  return {
    provider: kind,
    baseUrl: overrides?.baseUrl ?? DEFAULT_BASE_URLS[kind],
    model,
    ...(overrides?.apiKey ? { apiKey: overrides.apiKey } : {}),
    behavior: { ...DEFAULT_BEHAVIOR },
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
 * config, returning the updated copy. Validates keys and coerces booleans.
 */
export function applySetting(config: Config, key: string, value: string): Config {
  const next: Config = { ...config, behavior: { ...config.behavior } };

  if (key.startsWith(BEHAVIOR_PREFIX)) {
    const flag = key.slice(BEHAVIOR_PREFIX.length);
    if (!isBehaviorKey(flag)) throw new Error(`unknown config key: ${key}`);
    next.behavior[flag] = parseBool(value, key);
    return next;
  }

  switch (key) {
    case 'provider': {
      if (!VALID_KINDS.has(value)) throw new Error(`invalid provider: ${value}`);
      next.provider = value as ProviderKind;
      return next;
    }
    case 'baseUrl':
      next.baseUrl = value;
      return next;
    case 'model':
      next.model = value;
      return next;
    case 'apiKey':
      next.apiKey = value;
      return next;
    default:
      throw new Error(`unknown config key: ${key}`);
  }
}

function parseBool(value: string, key: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} expects true or false, got "${value}"`);
}

function validate(input: unknown): Config {
  if (typeof input !== 'object' || input === null) {
    throw new Error('config must be a JSON object');
  }
  const obj = input as Record<string, unknown>;

  if (typeof obj.provider !== 'string' || !VALID_KINDS.has(obj.provider)) {
    throw new Error(`config.provider is missing or invalid: ${String(obj.provider)}`);
  }
  if (typeof obj.baseUrl !== 'string' || obj.baseUrl.length === 0) {
    throw new Error('config.baseUrl is missing');
  }
  if (typeof obj.model !== 'string' || obj.model.length === 0) {
    throw new Error('config.model is missing');
  }
  if (obj.apiKey !== undefined && typeof obj.apiKey !== 'string') {
    throw new Error('config.apiKey must be a string');
  }

  const behavior = (obj.behavior ?? {}) as Record<string, unknown>;
  const config: Config = {
    provider: obj.provider as ProviderKind,
    baseUrl: obj.baseUrl,
    model: obj.model,
    behavior: {
      autoConfirmSafe: asBool(behavior.autoConfirmSafe, DEFAULT_BEHAVIOR.autoConfirmSafe),
      explain: asBool(behavior.explain, DEFAULT_BEHAVIOR.explain),
      includeHistory: asBool(behavior.includeHistory, DEFAULT_BEHAVIOR.includeHistory),
      includeGit: asBool(behavior.includeGit, DEFAULT_BEHAVIOR.includeGit),
      think: asBool(behavior.think, DEFAULT_BEHAVIOR.think),
    },
  };
  if (typeof obj.apiKey === 'string') config.apiKey = obj.apiKey;
  return config;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
