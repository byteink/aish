/**
 * Builds the standalone, self-contained `ai` binary via `bun build --compile`.
 *
 * This is the Homebrew / GitHub Release artifact: platform-specific, no Node or
 * Bun required at runtime. It is NOT the npm artifact (see scripts/build.ts).
 *
 * Usage: bun run scripts/build-binary.ts [bun-target] [outfile]
 *   e.g. bun run scripts/build-binary.ts bun-darwin-arm64 dist/aish-darwin-arm64
 * With no args it compiles for the host platform to ./aish.
 */
import { spawnSync } from 'node:child_process';

const target = process.argv[2];
const outfile = process.argv[3] ?? 'aish';

const args = [
  'build',
  '--compile',
  '--minify',
  '--sourcemap=none',
  'src/cli.ts',
  '--outfile',
  outfile,
];
if (target) args.push(`--target=${target}`);

const { status } = spawnSync('bun', args, { stdio: 'inherit' });
if (status !== 0) {
  console.error(`bun build --compile failed (exit ${status})`);
  process.exit(status ?? 1);
}
console.log(`compiled ${outfile}${target ? ` for ${target}` : ''}`);
