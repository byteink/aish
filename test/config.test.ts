import { describe, expect, test } from 'bun:test';
import {
  type Config,
  DEFAULT_BEHAVIOR,
  activate,
  activeProfile,
  applySetting,
  listProviders,
  makeConfig,
  parseConfig,
  toProviderConfig,
} from '../src/config.ts';

const base: Config = makeConfig('ollama', 'llama3.1');

describe('makeConfig', () => {
  test('creates the active profile with default base URL and behaviour', () => {
    expect(base.provider).toBe('ollama');
    expect(activeProfile(base).baseUrl).toBe('http://localhost:11434/v1');
    expect(activeProfile(base).model).toBe('llama3.1');
    expect(activeProfile(base).apiKey).toBeUndefined();
    expect(base.behavior).toEqual(DEFAULT_BEHAVIOR);
  });

  test('includes apiKey only when provided', () => {
    const cfg = makeConfig('openai', 'gpt-4o', { apiKey: 'sk-x' });
    expect(activeProfile(cfg).apiKey).toBe('sk-x');
    expect(activeProfile(base).apiKey).toBeUndefined();
  });
});

describe('toProviderConfig', () => {
  test('maps the active profile to the provider input', () => {
    const cfg = makeConfig('openai', 'gpt-4o', { apiKey: 'sk-x' });
    expect(toProviderConfig(cfg)).toEqual({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiKey: 'sk-x',
    });
  });

  test('omits apiKey when the profile has none', () => {
    expect(toProviderConfig(base)).not.toHaveProperty('apiKey');
  });
});

describe('activate', () => {
  // A config with two configured providers and a non-default behaviour flag.
  const two: Config = {
    ...makeConfig('ollama', 'llama3.1'),
    behavior: { ...DEFAULT_BEHAVIOR, think: true },
    providers: {
      ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
      openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiKey: 'sk-x' },
    },
  };

  test('switches provider, adopts saved credentials, sets the model', () => {
    const next = activate(two, 'openai', 'gpt-4o-mini');
    expect(next.provider).toBe('openai');
    expect(activeProfile(next)).toEqual({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-x',
    });
  });

  test('preserves behaviour flags and other profiles', () => {
    const next = activate(two, 'openai', 'gpt-4o');
    expect(next.behavior.think).toBe(true);
    expect(next.providers.ollama).toEqual({ baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' });
  });

  test('does not mutate the original', () => {
    activate(two, 'openai', 'gpt-4o-mini');
    expect(two.provider).toBe('ollama');
    expect(two.providers.openai?.model).toBe('gpt-4o');
  });

  test('throws when the provider was never configured', () => {
    expect(() => activate(base, 'openai', 'gpt-4o')).toThrow();
  });
});

describe('listProviders', () => {
  test('lists every configured provider with the active one first', () => {
    const cfg: Config = {
      ...base,
      provider: 'openai',
      providers: {
        ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
        openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
      },
    };
    expect(listProviders(cfg)[0]).toBe('openai');
    expect([...listProviders(cfg)].sort((a, b) => a.localeCompare(b))).toEqual(['ollama', 'openai']);
  });
});

describe('applySetting', () => {
  test('sets the active model without mutating the original', () => {
    const next = applySetting(base, 'model', 'codellama');
    expect(activeProfile(next).model).toBe('codellama');
    expect(activeProfile(base).model).toBe('llama3.1');
  });

  test('edits the active profile baseUrl and apiKey', () => {
    const next = applySetting(applySetting(base, 'baseUrl', 'http://host/v1'), 'apiKey', 'sk-y');
    expect(activeProfile(next).baseUrl).toBe('http://host/v1');
    expect(activeProfile(next).apiKey).toBe('sk-y');
  });

  test('coerces boolean behaviour flags', () => {
    expect(applySetting(base, 'behavior.explain', 'false').behavior.explain).toBe(false);
  });

  test('rejects a non-boolean for a boolean flag', () => {
    expect(() => applySetting(base, 'behavior.explain', 'nope')).toThrow();
  });

  test('rejects an invalid provider kind', () => {
    expect(() => applySetting(base, 'provider', 'gemini')).toThrow();
  });

  test('rejects switching to a provider that is not configured', () => {
    expect(() => applySetting(base, 'provider', 'openrouter')).toThrow();
  });

  test('switches to an already-configured provider', () => {
    const two = activate(
      { ...base, providers: { ...base.providers, openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' } } },
      'ollama',
      'llama3.1',
    );
    expect(applySetting(two, 'provider', 'openai').provider).toBe('openai');
  });

  test('rejects an unknown key', () => {
    expect(() => applySetting(base, 'nope', 'x')).toThrow();
  });
});

describe('parseConfig', () => {
  test('migrates a legacy single-provider file into a providers map', () => {
    const legacy = {
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'deepseek/deepseek-v4-flash',
      apiKey: 'sk-or-1',
    };
    const cfg = parseConfig(legacy);
    expect(cfg.provider).toBe('openrouter');
    expect(cfg.providers.openrouter).toEqual({
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'deepseek/deepseek-v4-flash',
      apiKey: 'sk-or-1',
    });
    expect(cfg.behavior).toEqual(DEFAULT_BEHAVIOR);
  });

  test('keeps a modern providers map and drops malformed entries', () => {
    const cfg = parseConfig({
      provider: 'openai',
      behavior: {},
      providers: {
        openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiKey: 'sk-x' },
        gemini: { baseUrl: 'x', model: 'y' }, // invalid kind → dropped
        ollama: { baseUrl: 'http://h/v1' }, // missing model → dropped
      },
    });
    expect(Object.keys(cfg.providers)).toEqual(['openai']);
    expect(cfg.providers.openai?.apiKey).toBe('sk-x');
  });

  test('throws when the active provider has no profile and no legacy fields', () => {
    expect(() => parseConfig({ provider: 'openai', providers: {} })).toThrow();
  });

  test('throws on an invalid provider', () => {
    expect(() => parseConfig({ provider: 'gemini' })).toThrow();
  });
});
