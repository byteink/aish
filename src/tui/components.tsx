/**
 * Shared Ink primitives used across the TUI frames: a braille spinner and a
 * minimal single-line text input. Kept tiny and dependency-free so every frame
 * renders and behaves identically.
 */
import { Text, useInput } from 'ink';
import { useEffect, useState } from 'react';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** A braille spinner that advances on a fixed interval. */
export function Spinner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color="cyan">{SPINNER[i]}</Text>;
}

/**
 * Minimal controlled input: typing, backspace, Enter (submit), Esc/Ctrl-C
 * (cancel). With `mask`, the value is shown as dots so secrets like API keys
 * never appear on screen.
 */
export function TextInput({
  value,
  placeholder,
  mask,
  onChange,
  onSubmit,
  onCancel,
}: Readonly<{
  value: string;
  placeholder?: string;
  mask?: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}>) {
  useInput((input, key) => {
    if (key.return) return onSubmit(value);
    if (key.escape || (key.ctrl && input === 'c')) return onCancel();
    if (key.backspace || key.delete) return onChange(value.slice(0, -1));
    if (input && !key.ctrl && !key.meta) onChange(value + input);
  });
  const shown = mask ? '•'.repeat(value.length) : value;
  return (
    <Text>
      {value ? <Text>{shown}</Text> : <Text dimColor>{placeholder ?? ''}</Text>}
      <Text inverse> </Text>
    </Text>
  );
}
