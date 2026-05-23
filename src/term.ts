/**
 * Pure terminal-presentation utilities: NO_COLOR-aware ANSI colouring and
 * width-aware word wrapping. No dependency on any prompt library, so both the
 * Ink frames and the clack adapter can share them.
 */
const COLOR_ENABLED =
  !process.env.NO_COLOR && process.stdout.isTTY === true && process.env.TERM !== 'dumb';

function paint(open: number, close: number): (s: string) => string {
  return COLOR_ENABLED ? (s) => `\x1b[${open}m${s}\x1b[${close}m` : (s) => s;
}

export const color = {
  bold: paint(1, 22),
  dim: paint(2, 22),
  red: paint(31, 39),
  green: paint(32, 39),
  yellow: paint(33, 39),
  cyan: paint(36, 39),
};

// clack frames every line with a "│  " gutter and the box border, so reserve a
// few columns. Floor keeps things sane on absurdly narrow terminals.
const GUTTER = 6;
const MIN_WIDTH = 24;
const FALLBACK_WIDTH = 80;

/** Current terminal width, or a sane default when not attached to a TTY. */
export function terminalColumns(): number {
  const cols = process.stdout.columns;
  return cols && cols > 0 ? cols : FALLBACK_WIDTH;
}

/**
 * Word-wrap text to the terminal width, preserving existing line breaks and
 * hard-breaking tokens longer than the line (e.g. URLs or long flags). Used to
 * keep clack boxes and messages inside the actual terminal.
 */
export function wrap(text: string, width = terminalColumns() - GUTTER): string {
  const limit = Math.max(MIN_WIDTH, width);
  return text
    .split('\n')
    .map((line) => wrapLine(line, limit))
    .join('\n');
}

function wrapLine(line: string, limit: number): string {
  if (line.length <= limit) return line;
  const out: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current) out.push(current);
    current = '';
  };
  for (const word of line.split(/\s+/)) {
    if (!word) continue;
    if (word.length > limit) {
      flush();
      for (let i = 0; i < word.length; i += limit) out.push(word.slice(i, i + limit));
      continue;
    }
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= limit) {
      current += ` ${word}`;
    } else {
      flush();
      current = word;
    }
  }
  flush();
  return out.join('\n');
}
