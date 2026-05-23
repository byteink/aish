/**
 * A transient single-choice list rendered with Ink (↑/↓ to move, Enter to pick,
 * Esc to cancel). Used for in-session pickers such as switching the model. The
 * frame erases itself on exit; the host prints any resulting confirmation.
 * Resolves to the chosen item, or null when cancelled.
 */
import { Box, Text, render, useApp, useInput } from 'ink';
import { useState } from 'react';

function SelectList({
  message,
  items,
  onPick,
  onCancel,
}: Readonly<{
  message: string;
  items: readonly string[];
  onPick: (item: string) => void;
  onCancel: () => void;
}>) {
  const { exit } = useApp();
  const [sel, setSel] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) setSel((s) => (s + items.length - 1) % items.length);
    else if (key.downArrow) setSel((s) => (s + 1) % items.length);
    else if (key.return) {
      onPick(items[sel] as string);
      exit();
    } else if (key.escape) {
      onCancel();
      exit();
    }
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

export async function selectList(
  message: string,
  items: readonly string[],
): Promise<string | null> {
  if (items.length === 0) return null;
  let result: string | null = null;
  const instance = render(
    <SelectList
      message={message}
      items={items}
      onPick={(item) => {
        result = item;
      }}
      onCancel={() => {
        result = null;
      }}
    />,
  );
  await instance.waitUntilExit();
  instance.clear();
  return result;
}
