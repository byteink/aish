/**
 * Show a spinner while a promise settles, then erase the frame. Lets onboarding
 * indicate progress (detecting providers, fetching models) without a second
 * prompt library owning stdin. The spinner's own interval keeps the event loop
 * alive across the work; a rejection propagates to the caller.
 */
import { Box, Text } from 'ink';
import { useEffect } from 'react';
import { Spinner } from './components.tsx';
import { runFrame } from './render.ts';

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function Status({
  message,
  work,
  resolve,
}: Readonly<{
  message: string;
  work: Promise<unknown>;
  resolve: (value: Settled<unknown>) => void;
}>) {
  useEffect(() => {
    let alive = true;
    work.then(
      (value) => {
        if (alive) resolve({ ok: true, value });
      },
      (error) => {
        if (alive) resolve({ ok: false, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [work, resolve]);

  return (
    <Box>
      <Spinner />
      <Text> {message}…</Text>
    </Box>
  );
}

export async function withStatus<T>(message: string, work: Promise<T>): Promise<T> {
  const settled = await runFrame<Settled<unknown>>((resolve) => (
    <Status message={message} work={work} resolve={resolve} />
  ));
  if (settled.ok) return settled.value as T;
  throw settled.error;
}
