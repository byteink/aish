/**
 * Renders homebrew/aish.rb by substituting the version and per-platform SHA256s,
 * writing the result to the path given as the last argument (default stdout).
 *
 * Usage:
 *   bun run scripts/render-formula.ts <version> <out-path>
 * Reads the SHA256s from the environment so they are never logged on the CLI:
 *   SHA_DARWIN_ARM64, SHA_DARWIN_X86_64, SHA_LINUX_X86_64
 */
import { readFile, writeFile } from 'node:fs/promises';

const version = process.argv[2];
const outPath = process.argv[3];
if (!version) {
  console.error('usage: render-formula.ts <version> [out-path]');
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}

const replacements: Record<string, string> = {
  __VERSION__: version,
  __SHA_DARWIN_ARM64__: requireEnv('SHA_DARWIN_ARM64'),
  __SHA_DARWIN_X86_64__: requireEnv('SHA_DARWIN_X86_64'),
  __SHA_LINUX_X86_64__: requireEnv('SHA_LINUX_X86_64'),
};

let formula = await readFile('homebrew/aish.rb', 'utf8');
for (const [token, value] of Object.entries(replacements)) {
  formula = formula.replaceAll(token, value);
}

if (outPath) {
  await writeFile(outPath, formula);
  console.error(`wrote ${outPath}`);
} else {
  process.stdout.write(formula);
}
