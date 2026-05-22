/**
 * Runtime shim: prefer Bun-native APIs when running under Bun, fall back to
 * Node built-ins otherwise. The published dist/cli.mjs runs under plain Node,
 * so every Bun-only call must have a deterministic Node equivalent here. This
 * is the single place that branches on the runtime — nothing else should.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdir, chmod as nodeChmod, readFile, writeFile } from 'node:fs/promises';

declare const Bun: typeof import('bun') | undefined;

const hasBun = typeof Bun !== 'undefined';

/** Read a UTF-8 file, returning `null` if it does not exist. */
export async function readText(path: string): Promise<string | null> {
  try {
    if (hasBun) {
      const file = Bun.file(path);
      return (await file.exists()) ? await file.text() : null;
    }
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Write a UTF-8 file, creating parent directories as needed. */
export async function writeText(path: string, content: string): Promise<void> {
  const dir = path.slice(0, path.lastIndexOf('/'));
  if (dir) await mkdir(dir, { recursive: true });
  // node:fs/writeFile is portable and lets us set mode atomically on create.
  await writeFile(path, content, { mode: 0o600 });
}

/** Set file permissions (used to enforce 0600 on the config). */
export async function chmod(path: string, mode: number): Promise<void> {
  await nodeChmod(path, mode);
}

/** Ensure a directory exists with the given mode. */
export async function ensureDir(path: string, mode = 0o700): Promise<void> {
  await mkdir(path, { recursive: true, mode });
}

/**
 * Run a command in the user's shell, streaming stdout/stderr live to the
 * terminal by inheriting the parent's stdio. Resolves with the exit code.
 */
export function runInShell(command: string, shell: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // -c is honored by sh, bash, zsh, fish. The command string is passed
    // verbatim; the shell performs its own parsing.
    const child = nodeSpawn(shell, ['-c', command], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 0));
  });
}

/** Capture a command's stdout (trimmed). Returns `null` on any failure. */
export function captureOutput(
  command: string,
  shell: string,
  timeoutMs = 2000,
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = nodeSpawn(shell, ['-c', command], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: timeoutMs,
    });
    let out = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null));
  });
}

/**
 * Copy text to the OS clipboard. Returns false if no clipboard tool is found,
 * so callers can fall back to printing the text for manual copy.
 */
function clipboardCandidates(): Array<[string, string[]]> {
  if (process.platform === 'darwin') return [['pbcopy', []]];
  if (process.platform === 'win32') return [['clip', []]];
  // Linux/BSD: try Wayland, then X11 tools, in order.
  return [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
  ];
}

export function copyToClipboard(text: string): Promise<boolean> {
  const candidates = clipboardCandidates();

  return new Promise((resolve) => {
    const tryNext = (i: number): void => {
      const entry = candidates[i];
      if (!entry) {
        resolve(false);
        return;
      }
      const [cmd, args] = entry;
      const child = nodeSpawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
      child.on('error', () => tryNext(i + 1)); // tool not installed: try the next
      child.on('close', (code) => resolve(code === 0));
      child.stdin?.end(text);
    };
    tryNext(0);
  });
}
