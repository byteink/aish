import { describe, expect, test } from 'bun:test';
import { runInShellCapture } from '../src/runtime.ts';

describe('runInShellCapture', () => {
  test('captures stdout and reports a zero exit', async () => {
    const { code, output } = await runInShellCapture('echo hello', '/bin/sh');
    expect(code).toBe(0);
    expect(output).toContain('hello');
  });

  test('captures stderr and the non-zero exit code', async () => {
    const { code, output } = await runInShellCapture('echo oops >&2; exit 3', '/bin/sh');
    expect(code).toBe(3);
    expect(output).toContain('oops');
  });
});
