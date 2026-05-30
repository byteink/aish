import { describe, expect, test } from 'bun:test';
import { SLASH_COMMANDS, helpText, matchCommands } from '../src/commands.ts';

describe('matchCommands', () => {
  test('returns every command for a bare slash', () => {
    expect(matchCommands('/')).toEqual(SLASH_COMMANDS);
  });

  test('prefix-matches on the command name', () => {
    expect(matchCommands('/mo').map((c) => c.name)).toEqual(['/model']);
  });

  test('is case-insensitive', () => {
    expect(matchCommands('/MO').map((c) => c.name)).toEqual(['/model']);
  });

  test('matches on an alias prefix', () => {
    // /quit and /bye are aliases of /exit.
    expect(matchCommands('/qu').map((c) => c.name)).toEqual(['/exit']);
    expect(matchCommands('/by').map((c) => c.name)).toEqual(['/exit']);
  });

  test('returns nothing for an unknown token', () => {
    expect(matchCommands('/zzz')).toEqual([]);
  });
});

describe('helpText', () => {
  test('lists every command and shows aliases only where present', () => {
    const text = helpText();
    for (const cmd of SLASH_COMMANDS) {
      expect(text).toContain(cmd.name);
      expect(text).toContain(cmd.summary);
    }
    expect(text).toContain('aliases: /quit, /bye');
    // A command without aliases must not print an alias suffix.
    expect(text).not.toContain('/clear (aliases');
  });
});
