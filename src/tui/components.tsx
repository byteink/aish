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

/** Minimal controlled input: typing, backspace, Enter (submit), Esc (cancel). */
export function TextInput({
  value,
  placeholder,
  onChange,
  onSubmit,
  onCancel,
}: Readonly<{
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}>) {
  useInput((input, key) => {
    if (key.return) return onSubmit(value);
    if (key.escape) return onCancel();
    if (key.backspace || key.delete) return onChange(value.slice(0, -1));
    if (input && !key.ctrl && !key.meta) onChange(value + input);
  });
  return (
    <Text>
      {value ? <Text>{value}</Text> : <Text dimColor>{placeholder ?? ''}</Text>}
      <Text inverse> </Text>
    </Text>
  );
}
