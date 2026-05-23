/**
 * Shared Bun bundler plugin: stub `react-devtools-core` to an empty module.
 *
 * Ink statically imports react-devtools-core from a module it only loads under
 * DEV, but the bundler hoists that import to the top of the output. Stubbing it
 * keeps every artifact (npm bundle and standalone binary) free of the optional
 * dependency and able to start without it; the code path that uses it is dead
 * in our builds.
 */
import type { BunPlugin } from 'bun';

export const stubReactDevtools: BunPlugin = {
  name: 'stub-react-devtools',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core',
      namespace: 'stub-devtools',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub-devtools' }, () => ({
      contents: 'export default {};',
      loader: 'js',
    }));
  },
};
