/**
 * A transient yes/no Ink frame (y = yes; n / Esc / Enter = no). Defaults to no
 * so a prompt never commits the user to an action they didn't ask for. Erases
 * itself on exit. Resolves true only on an explicit yes.
 */
import { Box, Text, useInput } from 'ink';
import { runFrame } from './render.ts';

function Confirm({
  message,
  resolve,
}: Readonly<{ message: string; resolve: (value: boolean) => void }>) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') resolve(true);
    else if (input === 'n' || input === 'N' || key.escape || key.return) resolve(false);
  });
  return (
    <Box>
      <Text>{message} </Text>
      <Text dimColor>(y/N)</Text>
    </Box>
  );
}

export function confirmFrame(message: string): Promise<boolean> {
  return runFrame<boolean>((resolve) => <Confirm message={message} resolve={resolve} />);
}
