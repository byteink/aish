/**
 * Bundles src/cli.ts into a single portable ESM file at dist/cli.mjs.
 *
 * The output is the npm artifact: it must run under plain Node (>=18), not just
 * Bun. We target "node", bundle every dependency (so the published package has
 * zero runtime deps), then guarantee a `#!/usr/bin/env node` shebang and the
 * executable bit so `npm i -g` and `npx` work without Bun installed.
 */
import { chmod } from 'node:fs/promises';

const SHEBANG = '#!/usr/bin/env node\n';
const OUT_DIR = 'dist';
const OUT_FILE = `${OUT_DIR}/cli.mjs`;

const result = await Bun.build({
  entrypoints: ['src/cli.ts'],
  outdir: OUT_DIR,
  target: 'node',
  format: 'esm',
  // Ink statically imports react-devtools-core from a module it only loads
  // under DEV, but the bundler hoists that import to the top of the bundle.
  // Stub it to an empty module so the artifact keeps zero runtime deps and
  // never fails to resolve at startup; the code path that uses it is dead here.
  plugins: [
    {
      name: 'stub-react-devtools',
      setup(build) {
        build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: 'react-devtools-core',
          namespace: 'stub',
        }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export default {};',
          loader: 'js',
        }));
      },
    },
  ],
  minify: true,
  sourcemap: 'none',
  naming: 'cli.mjs',
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error('build failed');
}

// Bun does not reliably forward a hashbang from the entrypoint, so we prepend
// it ourselves and skip duplication if a future Bun starts adding one.
const bundled = await Bun.file(OUT_FILE).text();
const withShebang = bundled.startsWith('#!') ? bundled : SHEBANG + bundled;
await Bun.write(OUT_FILE, withShebang);
await chmod(OUT_FILE, 0o755);

console.log(`built ${OUT_FILE} (${(withShebang.length / 1024).toFixed(1)} KiB)`);
