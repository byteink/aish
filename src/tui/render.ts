/**
 * One place that owns the lifecycle of a short-lived Ink frame: render it,
 * resolve with whatever value the frame reports, then unmount — and optionally
 * erase the frame from the scrollback. Every frame runner builds on this so the
 * render/teardown dance is never repeated.
 */
import { render } from 'ink';
import type { ReactElement } from 'react';

/**
 * Render a frame and resolve with the value it reports through the `resolve`
 * callback passed to `build`. On resolve the frame is unmounted; it is also
 * cleared from the scrollback when `clearOnExit` returns true for that value
 * (the default clears every time). Ctrl-C is not auto-handled so frames can
 * treat it as their own cancel signal.
 */
export function runFrame<T>(
  build: (resolve: (value: T) => void) => ReactElement,
  clearOnExit: (value: T) => boolean = () => true,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (value: T): void => {
      if (settled) return;
      settled = true;
      if (clearOnExit(value)) instance.clear();
      instance.unmount();
      resolve(value);
    };
    const instance = render(build(done), { exitOnCtrlC: false });
  });
}
