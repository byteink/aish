/**
 * A labelled single-line input rendered as a transient Ink frame: the prompt on
 * its own line, the editable value below. Supports a pre-filled value, a
 * placeholder, and masking for secrets. Resolves to the entered string, or null
 * when the user cancels (Esc / Ctrl-C). Replaces the old clack text/password
 * prompts so onboarding shares one stdin owner with the rest of the TUI.
 */
import { Box, Text } from 'ink';
import { useState } from 'react';
import { TextInput } from './components.tsx';
import { runFrame } from './render.ts';

function Field({
  message,
  placeholder = '',
  initialValue = '',
  mask = false,
  resolve,
}: Readonly<{
  message: string;
  placeholder?: string;
  initialValue?: string;
  mask?: boolean;
  resolve: (value: string | null) => void;
}>) {
  const [value, setValue] = useState(initialValue);
  return (
    <Box flexDirection="column">
      <Text color="cyan">{message}</Text>
      <Box>
        <Text dimColor>{'› '}</Text>
        <TextInput
          value={value}
          placeholder={placeholder}
          mask={mask}
          onChange={setValue}
          onSubmit={(v) => resolve(v)}
          onCancel={() => resolve(null)}
        />
      </Box>
    </Box>
  );
}

export function field(
  message: string,
  opts: Readonly<{ placeholder?: string; initialValue?: string; mask?: boolean }> = {},
): Promise<string | null> {
  return runFrame<string | null>((resolve) => (
    <Field message={message} resolve={resolve} {...opts} />
  ));
}
