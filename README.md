# aish

> AI shell assistant that turns natural language into shell commands.

`aish` installs an `ai` command that converts plain English into a shell command
idiomatic to your OS and shell, shows you what it will run, and lets you run,
revise, copy, or cancel. It is **local-first**: it talks to Ollama or LM Studio
out of the box, and also supports OpenAI and Anthropic.

```text
$ ai list all files larger than 100MB in this directory

  Suggested command
  find . -type f -size +100M
  Find files over 100 MB under the current directory

  ? What next?  › Run / Revise / Copy / Cancel
```

## Install

**npm** (runs on Node ≥ 18, no Bun required):

```sh
npm i -g @byteink/aish
# or run without installing
npx @byteink/aish "show my git branches sorted by last commit"
```

**Homebrew** (standalone binary, no Node needed):

```sh
brew install byteink/tap/aish
```

## Usage

### One-shot

No quotes needed for ordinary requests:

```sh
ai list all files over 100mb
ai compress the logs folder into logs.tar.gz
```

Quote the request only if it contains characters your shell treats specially
(`?`, `*`, `>`, `|`, `&`, `$`, quotes, parentheses), otherwise the shell will
interpret them before aish sees them:

```sh
ai "what's using port 8080?"
```

You get the suggested command plus a one-line explanation, then a prompt:

- **Run**: execute it in your shell, output streamed live
- **Revise**: give feedback and get a new command
- **Copy**: copy to clipboard
- **Cancel**: do nothing

### Interactive

Run `ai` with no arguments for a persistent chat session. Each turn either
answers conversationally or proposes a command with the same Run/Revise/Copy/
Cancel flow. Conversation history is kept for the session.

Slash commands:

| Command | Action |
|---|---|
| `/exit` | end the session |
| `/clear` | clear conversation history |
| `/model` | switch model |
| `/provider` | switch provider (re-run setup) |
| `/think` | toggle model reasoning on/off |
| `/help` | list commands |

## Providers

On first run, `aish` detects a running local provider on localhost and walks you
through choosing the endpoint, an optional API key, and a model. If nothing is
configured yet, running `ai <request>` starts this setup automatically.

| Provider | Default endpoint | Auth |
|---|---|---|
| Ollama | `http://localhost:11434/v1` | optional API key |
| LM Studio | `http://localhost:1234/v1` | optional API key |
| OpenAI | `https://api.openai.com/v1` | API key required |
| Anthropic | `https://api.anthropic.com/v1` | API key required |

**Local providers are not limited to localhost.** Ollama and LM Studio can run
on another machine, a LAN address, a reverse proxy, or a tunnel. During setup
(or via `ai config set baseUrl <url>`) point aish at any URL, and supply an
optional API key if that endpoint sits behind auth:

```sh
ai config set provider ollama
ai config set baseUrl https://ollama.box.lan/v1
ai config set apiKey   my-gateway-token       # only if the endpoint needs it
```

All four providers implement a common streaming `chat()` interface, so adding a
provider is a single small file.

## Configuration

Config lives in `~/.aish/config.json` (created at `0600`).

```sh
ai config           # show current config (API key redacted)
ai config get       # same as above
ai config set model llama3.1
ai config set behavior.explain false
ai config edit      # open in $EDITOR
ai config path      # print the file path
```

Keys: `provider`, `baseUrl`, `model`, `apiKey`, and `behavior.*`:

| Behaviour flag | Default | Meaning |
|---|---|---|
| `behavior.autoConfirmSafe` | `false` | run non-flagged commands without the Run prompt |
| `behavior.explain` | `true` | show the one-line explanation |
| `behavior.includeHistory` | `false` | include recent shell history as context |
| `behavior.includeGit` | `true` | include `git status` when in a repo |
| `behavior.think` | `false` | ask reasoning models to think first (slower); `<think>` blocks are always stripped from the reply |

### Context awareness

The model is given your OS, shell, and current directory. Optionally, and only
when enabled, a snippet of recent shell history and `git status`. Toggle these
with the `behavior.includeHistory` / `behavior.includeGit` flags for privacy.

## Safety

Before running, every command is scanned for destructive patterns (`rm -rf`,
`dd`, `mkfs`, fork bombs, `chmod -R 777`, `curl … | sh`, force-push, and more).
A flagged command is clearly warned and **always requires an extra
confirmation**; it is never auto-run, even with `autoConfirmSafe` enabled.

This is a heuristic guard, not a sandbox. Read what you run.

`NO_COLOR` is respected.

## Development

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev "list files over 100mb"   # one-shot against your config
bun run dev                            # interactive
bun test                               # unit tests
bun run typecheck && bun run lint      # quality gates
bun run build                          # bundle dist/cli.mjs
```

### Inspecting the npm tarball

Before publishing, confirm only `dist`, `README.md`, and `LICENSE` ship:

```sh
npm pack --dry-run
```

## Maintainer: releasing

Releases are tag-driven. The
[release workflow](.github/workflows/release.yml) publishes to npm with
provenance, builds the standalone binaries (macOS arm64/x64, Linux x64),
attaches them to the GitHub Release, and pushes an updated formula to
`byteink/homebrew-tap`.

```sh
# bump version, commit, tag, push
npm version patch          # or minor / major
git push --follow-tags
```

Required GitHub Actions secrets:

- `NPM_TOKEN`: granular/automation npm token with publish rights for the
  `@byteink` scope. Never commit it; never commit an `.npmrc` containing a token.
- `HOMEBREW_TAP_GITHUB_TOKEN`: token with push access to `byteink/homebrew-tap`.

The `prepublishOnly` script rebuilds `dist` and runs typecheck + lint, so a
broken build can never be published.

## License

[Elastic License 2.0](LICENSE) © ByteInk.

Free to use, modify, and redistribute, including commercially and inside a
business. The one thing you may not do is offer aish to third parties as a
hosted or managed service, or strip its license/copyright notices.
