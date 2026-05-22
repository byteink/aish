# Contributing to aish

Thanks for helping improve `aish`.

## Setup

Install [Bun](https://bun.sh), then:

```sh
bun install
```

## Workflow

```sh
bun run dev "..."   # run one-shot against your local config
bun run dev         # interactive session
bun test            # unit tests
bun run typecheck   # tsc --noEmit (strict)
bun run lint        # biome
bun run build       # bundle dist/cli.mjs
```

All four gates (`typecheck`, `lint`, `test`, `build`) must pass before a PR is
merged; CI enforces them. `prepublishOnly` re-runs build + typecheck + lint, so
a broken build can never reach npm.

## Adding a provider

1. Create `src/providers/<name>.ts` implementing the `Provider` interface from
   [src/providers/index.ts](src/providers/index.ts).
2. Add it to the `ProviderKind` union, `DEFAULT_BASE_URLS`, `PROVIDER_LABELS`,
   and the `createProvider` switch.
3. If it is OpenAI-compatible, reuse `streamOpenAICompat` /
   `listOpenAICompatModels` rather than re-implementing SSE.

## Releasing

Maintainers only. Tag-driven — see the "Maintainer: releasing" section of the
[README](README.md). Required secrets: `NPM_TOKEN`, `HOMEBREW_TAP_GITHUB_TOKEN`.

```sh
npm version patch        # bump + tag
git push --follow-tags   # triggers .github/workflows/release.yml
```
