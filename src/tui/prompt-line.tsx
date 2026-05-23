/**
 * A one-line REPL prompt rendered with Ink. Unlike the suggestion frame, a
 * submitted prompt is left in the scrollback (without the cursor) so the
 * session reads as a natural transcript; a cancelled or empty prompt erases
 * itself. Resolves to the trimmed input, or null when the user ends the session
 * (Ctrl-C / Esc).
 */
import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import { runFrame } from './render.ts';

type State = 'editing' | 'submitted' | 'cancelled';

function PromptLine({
  label,
  placeholder,
  resolve,
}: Readonly<{
  label: string;
  placeholder: string;
  resolve: (value: string | null) => void;
}>) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<State>('editing');

  useInput((input, key) => {
    if (state !== 'editing') return;
    if (key.return) return setState('submitted');
    if (key.escape || (key.ctrl && input === 'c')) return setState('cancelled');
    if (key.backspace || key.delete) return setValue((v) => v.slice(0, -1));
    if (input && !key.ctrl && !key.meta) setValue((v) => v + input);
  });

  // Report the result only after the terminal state has rendered, so the
  // committed scrollback line matches what the user sees.
  useEffect(() => {
    if (state === 'submitted') resolve(value.trim());
    else if (state === 'cancelled') resolve(null);
  }, [state, value, resolve]);

  if (state === 'cancelled') return null;

  return (
    <Box>
      <Text color="cyan">{label} </Text>
      {value ? (
        <Text>{value}</Text>
      ) : (
        <Text dimColor>{state === 'editing' ? placeholder : ''}</Text>
      )}
      {state === 'editing' ? <Text inverse> </Text> : null}
    </Box>
  );
}

export function promptLine(
  label: string,
  opts: Readonly<{ placeholder?: string }> = {},
): Promise<string | null> {
  return runFrame<string | null>(
    (resolve) => (
      <PromptLine label={label} placeholder={opts.placeholder ?? ''} resolve={resolve} />
    ),
    // Keep a non-empty submission in the transcript; erase cancels and blanks.
    (value) => !value,
  );
}
