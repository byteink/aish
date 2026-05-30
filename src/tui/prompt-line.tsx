/**
 * A one-line REPL prompt rendered with Ink. Unlike the suggestion frame, a
 * submitted prompt is left in the scrollback (without the cursor) so the
 * session reads as a natural transcript; a cancelled or empty prompt erases
 * itself. Resolves to the trimmed input, or null when the user ends the session
 * (Ctrl-C / Esc).
 *
 * When `commands` are supplied it grows the slash-command palette: a bare slash
 * token (no space yet) opens a filtered menu below the line; ↑/↓ move, Tab
 * completes into the input, Enter runs the highlight, Esc closes the menu.
 */
import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { type SlashCommand, matchCommands } from '../commands.ts';
import { runFrame } from './render.ts';

type State = 'editing' | 'submitted' | 'cancelled';

function PromptLine({
  label,
  placeholder,
  commands,
  resolve,
}: Readonly<{
  label: string;
  placeholder: string;
  commands: boolean;
  resolve: (value: string | null) => void;
}>) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<State>('editing');
  const [sel, setSel] = useState(0);
  // Esc closes an open palette before it cancels the session, so it can be
  // dismissed without losing the typed line — the conventional palette UX.
  const [menuClosed, setMenuClosed] = useState(false);

  // The palette is live only while the whole input is a slash token: enabled,
  // not manually dismissed, no space typed yet.
  const matches = useMemo(
    () => (commands && !menuClosed && /^\/\S*$/.test(value) ? matchCommands(value) : []),
    [commands, menuClosed, value],
  );
  const menuOpen = matches.length > 0;
  const active = Math.min(sel, matches.length - 1);

  // Any edit reshapes the result set, so snap the highlight back to the top and
  // re-arm a palette the user had dismissed.
  const edit = (next: string): void => {
    setValue(next);
    setSel(0);
    setMenuClosed(false);
  };

  useInput((input, key) => {
    if (state !== 'editing') return;

    if (menuOpen) {
      if (key.upArrow) return setSel((s) => Math.max(0, s - 1));
      if (key.downArrow) return setSel((s) => Math.min(matches.length - 1, s + 1));
      if (key.tab) return edit((matches[active] as SlashCommand).name);
      if (key.return) {
        setValue((matches[active] as SlashCommand).name);
        return setState('submitted');
      }
      if (key.escape) return setMenuClosed(true);
    }

    if (key.return) return setState('submitted');
    if (key.escape || (key.ctrl && input === 'c')) return setState('cancelled');
    if (key.backspace || key.delete) return edit(value.slice(0, -1));
    if (input && !key.ctrl && !key.meta) edit(value + input);
  });

  // Report the result only after the terminal state has rendered, so the
  // committed scrollback line matches what the user sees.
  useEffect(() => {
    if (state === 'submitted') resolve(value.trim());
    else if (state === 'cancelled') resolve(null);
  }, [state, value, resolve]);

  if (state === 'cancelled') return null;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">{label} </Text>
        {value ? (
          <Text>{value}</Text>
        ) : (
          <Text dimColor>{state === 'editing' ? placeholder : ''}</Text>
        )}
        {state === 'editing' ? <Text inverse> </Text> : null}
      </Box>
      {state === 'editing' && menuOpen
        ? matches.map((c, i) => (
            <Text key={c.name} inverse={i === active} dimColor={i !== active}>
              {i === active ? '› ' : '  '}
              {c.name} <Text dimColor>{c.summary}</Text>
            </Text>
          ))
        : null}
    </Box>
  );
}

export function promptLine(
  label: string,
  opts: Readonly<{ placeholder?: string; commands?: boolean }> = {},
): Promise<string | null> {
  return runFrame<string | null>(
    (resolve) => (
      <PromptLine
        label={label}
        placeholder={opts.placeholder ?? ''}
        commands={opts.commands ?? false}
        resolve={resolve}
      />
    ),
    // Keep a non-empty submission in the transcript; erase cancels and blanks.
    (value) => !value,
  );
}
