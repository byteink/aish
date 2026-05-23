/**
 * A transient single-choice list rendered with Ink (↑/↓ to move, Enter to pick,
 * Esc to cancel). Used for in-session pickers such as switching the model. The
 * frame erases itself on exit; the host prints any resulting confirmation.
 * Resolves to the chosen item, or null when cancelled.
 */
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { runFrame } from './render.ts';

function SelectList({
  message,
  items,
  resolve,
}: Readonly<{
  message: string;
  items: readonly string[];
  resolve: (value: string | null) => void;
}>) {
  const [sel, setSel] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) setSel((s) => (s + items.length - 1) % items.length);
    else if (key.downArrow) setSel((s) => (s + 1) % items.length);
    else if (key.return) resolve(items[sel] as string);
    else if (key.escape) resolve(null);
  });

  return (
    <Box flexDirection="column">
      <Text>{message}</Text>
      {items.map((item, i) => (
        <Text key={item} inverse={i === sel} dimColor={i !== sel}>
          {i === sel ? '› ' : '  '}
          {item}
        </Text>
      ))}
    </Box>
  );
}

export function selectList(message: string, items: readonly string[]): Promise<string | null> {
  if (items.length === 0) return Promise.resolve(null);
  return runFrame<string | null>((resolve) => (
    <SelectList message={message} items={items} resolve={resolve} />
  ));
}
