/**
 * A one-line REPL prompt rendered with Ink. Unlike the suggestion frame, a
 * submitted prompt is left in the scrollback (without the cursor) so the
 * session reads as a natural transcript; a cancelled prompt erases itself.
 * Resolves to the trimmed input, or null when the user ends the session
 * (Ctrl-C / Esc).
 */
import { Box, Text, render, useApp, useInput } from 'ink';
import { useEffect, useState } from 'react';

type State = 'editing' | 'submitted' | 'cancelled';

function PromptLine({
  label,
  placeholder,
  onSubmit,
  onCancel,
}: Readonly<{
  label: string;
  placeholder: string;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}>) {
  const { exit } = useApp();
  const [value, setValue] = useState('');
  const [state, setState] = useState<State>('editing');

  useInput((input, key) => {
    if (state !== 'editing') return;
    if (key.return) return setState('submitted');
    if (key.escape || (key.ctrl && input === 'c')) return setState('cancelled');
    if (key.backspace || key.delete) return setValue((v) => v.slice(0, -1));
    if (input && !key.ctrl && !key.meta) setValue((v) => v + input);
  });

  // Report the result and tear down only after the terminal state has rendered,
  // so the committed scrollback line matches what the user sees.
  useEffect(() => {
    if (state === 'submitted') onSubmit(value);
    else if (state === 'cancelled') onCancel();
    if (state !== 'editing') exit();
  }, [state, value, onSubmit, onCancel, exit]);

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

export async function promptLine(
  label: string,
  opts: Readonly<{ placeholder?: string }> = {},
): Promise<string | null> {
  let result: string | null = null;
  const instance = render(
    <PromptLine
      label={label}
      placeholder={opts.placeholder ?? ''}
      onSubmit={(v) => {
        result = v.trim();
      }}
      onCancel={() => {
        result = null;
      }}
    />,
    { exitOnCtrlC: false },
  );
  await instance.waitUntilExit();
  // Erase cancelled or empty prompts so they leave no noise in the transcript.
  if (!result) instance.clear();
  return result;
}
