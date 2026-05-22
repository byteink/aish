import { describe, expect, test } from 'bun:test';
import { parseReply } from '../src/prompt.ts';

describe('parseReply', () => {
  test('parses a clean command JSON', () => {
    const r = parseReply('{"command":"ls -la","explanation":"list files"}', 'oneshot');
    expect(r).toEqual({ type: 'command', command: 'ls -la', explanation: 'list files' });
  });

  test('strips code fences around JSON', () => {
    const r = parseReply('```json\n{"command":"pwd","explanation":"cwd"}\n```', 'oneshot');
    expect(r.type).toBe('command');
    if (r.type === 'command') expect(r.command).toBe('pwd');
  });

  test('honours an explicit chat type in interactive mode', () => {
    const r = parseReply('{"type":"chat","message":"hello there"}', 'interactive');
    expect(r).toEqual({ type: 'chat', message: 'hello there' });
  });

  test('ignores prose surrounding the JSON object', () => {
    const r = parseReply('Sure! {"command":"date","explanation":"now"} hope that helps', 'oneshot');
    expect(r.type).toBe('command');
    if (r.type === 'command') expect(r.command).toBe('date');
  });

  test('one-shot fallback accepts a single short line as a command', () => {
    const r = parseReply('find . -type f -size +100M', 'oneshot');
    expect(r).toEqual({
      type: 'command',
      command: 'find . -type f -size +100M',
      explanation: 'No explanation provided.',
    });
  });

  test('one-shot fallback refuses multi-line prose as a command', () => {
    const prose = 'I cannot help with that.\nHere is some rambling text instead.';
    const r = parseReply(prose, 'oneshot');
    expect(r.type).toBe('chat');
  });

  test('interactive fallback returns prose as chat', () => {
    const r = parseReply('just chatting, no command here', 'interactive');
    expect(r.type).toBe('chat');
  });

  test('defaults explanation when missing', () => {
    const r = parseReply('{"command":"whoami"}', 'oneshot');
    if (r.type === 'command') expect(r.explanation).toBe('No explanation provided.');
    else throw new Error('expected command');
  });
});
