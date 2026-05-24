/**
 * A transient single-choice list rendered with Ink: type to filter, ↑/↓ to move,
 * Enter to pick, Esc to cancel. Used for in-session pickers such as switching the
 * model, where the list can be long (hundreds of models from a provider like
 * OpenRouter). Only a window of items sized to the terminal is shown and the
 * selection is kept centred in it, so the frame never overflows the screen and
 * every item is reachable. The frame erases itself on exit; the host prints any
 * resulting confirmation. Resolves to the chosen item, or null when cancelled.
 */
import { Box, Text, useInput } from 'ink';
import { useMemo, useState } from 'react';
import { terminalColumns, terminalRows } from '../term.ts';
import { runFrame } from './render.ts';

// Lines around the item window: message, filter, and the two overflow markers.
const CHROME_ROWS = 5;
const MIN_VISIBLE = 3;

/** Clamp `n` into the inclusive range [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Cut an item to one terminal line so row count stays predictable. */
function fit(item: string): string {
  const width = Math.max(8, terminalColumns() - 4);
  return item.length > width ? `${item.slice(0, width - 1)}…` : item;
}

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
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((item) => item.toLowerCase().includes(q)) : items;
  }, [items, query]);

  // A typed/erased character changes the result set, so snap back to the top.
  const edit = (next: string): void => {
    setQuery(next);
    setSel(0);
  };

  useInput((input, key) => {
    if (key.upArrow) return setSel((s) => clamp(s - 1, 0, filtered.length - 1));
    if (key.downArrow) return setSel((s) => clamp(s + 1, 0, filtered.length - 1));
    if (key.return) {
      if (filtered.length > 0) resolve(filtered[sel] as string);
      return;
    }
    if (key.escape) return resolve(null);
    if (key.backspace || key.delete) return edit(query.slice(0, -1));
    if (input && !key.ctrl && !key.meta) edit(query + input);
  });

  // Window the list to the terminal height, centring the selection so there is
  // always context above and below until an end is reached.
  const visibleCount = clamp(terminalRows() - CHROME_ROWS, MIN_VISIBLE, filtered.length || 1);
  const offset = clamp(sel - (visibleCount >> 1), 0, Math.max(0, filtered.length - visibleCount));
  const window = filtered.slice(offset, offset + visibleCount);

  const count = filtered.length > 0 ? `${sel + 1}/${filtered.length}` : `0/${items.length}`;

  return (
    <Box flexDirection="column">
      <Text>
        {message} <Text dimColor>({count})</Text>
      </Text>
      <Text dimColor>
        {query ? `filter: ${query}` : 'type to filter · ↑/↓ move · enter select · esc cancel'}
      </Text>
      {offset > 0 ? <Text dimColor> ⋯ {offset} more</Text> : <Text> </Text>}
      {filtered.length === 0 ? (
        <Text dimColor> no matches</Text>
      ) : (
        window.map((item, i) => {
          const idx = offset + i;
          return (
            <Text key={item} inverse={idx === sel} dimColor={idx !== sel}>
              {idx === sel ? '› ' : '  '}
              {fit(item)}
            </Text>
          );
        })
      )}
      {offset + window.length < filtered.length ? (
        <Text dimColor> ⋯ {filtered.length - offset - window.length} more</Text>
      ) : (
        <Text> </Text>
      )}
    </Box>
  );
}

export function selectList(message: string, items: readonly string[]): Promise<string | null> {
  if (items.length === 0) return Promise.resolve(null);
  return runFrame<string | null>((resolve) => (
    <SelectList message={message} items={items} resolve={resolve} />
  ));
}
