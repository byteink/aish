/**
 * Builds the standalone, self-contained `ai` binary via Bun's compile bundler.
 *
 * This is the Homebrew / GitHub Release artifact: platform-specific, no Node or
 * Bun required at runtime. It is NOT the npm artifact (see scripts/build.ts).
 *
 * Usage: bun run scripts/build-binary.ts [bun-target] [outfile]
 *   e.g. bun run scripts/build-binary.ts bun-darwin-arm64 dist/aish-darwin-arm64
 * With no args it compiles for the host platform to ./aish.
 *
 * Uses the Bun.build JS API (not `bun build --compile`) so the shared
 * react-devtools-core stub plugin applies here too; the CLI cannot load a
 * bundler plugin.
 */
import { stubReactDevtools } from './stub-devtools.ts';

// Caller supplies a valid Bun compile target (e.g. bun-darwin-arm64), same as
// the old `--target` CLI contract; Bun validates it at build time.
const target = process.argv[2] as Bun.Build.CompileTarget | undefined;
const outfile = process.argv[3] ?? 'aish';

const result = await Bun.build({
  entrypoints: ['src/cli.ts'],
  minify: true,
  sourcemap: 'none',
  plugins: [stubReactDevtools],
  compile: target ? { target, outfile } : { outfile },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error('bun compile failed');
}

const forTarget = target ? ` for ${target}` : '';
console.log(`compiled ${outfile}${forTarget}`);
