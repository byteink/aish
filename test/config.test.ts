import { describe, expect, test } from 'bun:test';
import { applySetting, type Config, DEFAULT_BEHAVIOR, makeConfig } from '../src/config.ts';

const base: Config = makeConfig('ollama', 'llama3.1');

describe('makeConfig', () => {
  test('uses the default base URL and behaviour', () => {
    expect(base.baseUrl).toBe('http://localhost:11434/v1');
    expect(base.behavior).toEqual(DEFAULT_BEHAVIOR);
    expect(base.apiKey).toBeUndefined();
  });

  test('includes apiKey only when provided', () => {
    expect(makeConfig('openai', 'gpt-4o', { apiKey: 'sk-x' }).apiKey).toBe('sk-x');
  });
});

describe('applySetting', () => {
  test('sets the model without mutating the original', () => {
    const next = applySetting(base, 'model', 'codellama');
    expect(next.model).toBe('codellama');
    expect(base.model).toBe('llama3.1');
  });

  test('coerces boolean behaviour flags', () => {
    const next = applySetting(base, 'behavior.explain', 'false');
    expect(next.behavior.explain).toBe(false);
  });

  test('toggles the think flag', () => {
    expect(base.behavior.think).toBe(false);
    const next = applySetting(base, 'behavior.think', 'true');
    expect(next.behavior.think).toBe(true);
  });

  test('rejects a non-boolean for a boolean flag', () => {
    expect(() => applySetting(base, 'behavior.explain', 'nope')).toThrow();
  });

  test('rejects an invalid provider', () => {
    expect(() => applySetting(base, 'provider', 'gemini')).toThrow();
  });

  test('accepts openrouter as a provider', () => {
    expect(applySetting(base, 'provider', 'openrouter').provider).toBe('openrouter');
    expect(makeConfig('openrouter', 'openai/gpt-4o').baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  test('rejects an unknown key', () => {
    expect(() => applySetting(base, 'nope', 'x')).toThrow();
  });
});
