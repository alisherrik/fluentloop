# FluentLoop

**Practise English while you build.**

Small, local English-coaching hooks for **Codex CLI** and **Claude Code**. Write a coding request, get a little language feedback, try once, and keep working.

No runtime dependencies. No separate model API. No prompt database. One shared policy, two adapters.

MIT-licensed. Install from GitHub today; no npm registry release has been published. The package remains private to prevent accidental npm publication. The name carries no availability or trademark claim.

## A small loop, not an English exam

An illustrative conversation (model responses will vary):

```text
You:    I wants add test for login handler.
Coach:  “I want to add a test for the login handler.”
        Use “want” with “I”; use “to add” after “want”. Try once more.
You:    I want to add a test for the login handler.
Coach:  Clear request. Let's add the test.
```

| Mode | What runs locally | What the assistant is asked to do |
| --- | --- | --- |
| `coach` (default) | Adds the shared coaching policy as context; never blocks locally | Review the user's work prose, offer a short correction when useful, and proceed after one retry |
| `english-first` | Also blocks a small set of recognizable non-English work requests | Coach prompts that pass the local heuristic |

The local gate **does not check English grammar**. If it blocks, the prompt never reaches the model: only a static rewrite cue is shown. Model-guided coaching is fallible and cannot guarantee that an assistant waits, gives correct feedback, or obeys every coaching preference.

## Get started

With Node.js 22+, npm and Git installed, run:

```sh
npx github:alisherrik/fluentloop init
```

1. Choose **Codex CLI**, **Claude Code**, or **both**.
2. Review the detected settings paths and hook preview. Default scope is your user account, across projects.
3. Type `y` to apply. Enter or `n` cancels without writing files.

Then open `/hooks` in your coding tool to review activation. FluentLoop never approves trust or changes permissions. Restart the host if needed. **Installing settings is not proof of live activation.**

This command fetches this GitHub repository through npm. The shorter **`npx fluentloop init` is a future registry command**, not available from this project yet. Do not substitute an unrelated registry package.

### Preview, project scope, or remove

```sh
npx github:alisherrik/fluentloop init --tool both --dry-run
npx github:alisherrik/fluentloop init --scope project
npx github:alisherrik/fluentloop uninstall
```

For project scope, run from the project root or pass `--project "/path/to/project"`. Settings in other scopes remain untouched. A script can explicitly confirm with `--tool codex --yes`. Choose the optional gate with `--mode english-first`; the default is `coach`.

Setup copies only the bundled hook runtime and license to `~/.fluentloop/runtimes/<content-hash>`. The installed hook survives npm cache cleanup, package removal and moving a checkout. Repeating setup is safe. Uninstall removes matching hooks from the selected settings and retains runtime files in case another scope uses them. Node must remain on the host's `PATH`.

See the [quickstart](docs/quickstart.md) for a global command, local tarballs, exact config paths, environment overrides and migration from v0.1. To try the source without installing hooks:

```sh
git clone https://github.com/alisherrik/fluentloop.git
cd fluentloop
node bin/fluentloop.cjs demo
node --test
```

The demo and tests use synthetic inputs and no model calls.

## Stay in control

Put these at the very start of the complete request:

```text
[fluentloop:retry] I want to fix the login handler.
[fluentloop:skip] Please work on this request without coaching.
```

`retry` bypasses the local gate and asks the assistant to proceed with at most one small improvement. `skip` bypasses the gate and asks for no coaching this turn. These are voluntary controls, not proof that a language exercise was completed. They never authorize technical actions. The original prompt, including its prefix, is still submitted to the host.

The hook is stateless: it cannot remember a rejected request or a task-wide opt-out. Resubmit the **complete** task after a block. In conversation, the model may recognize a retry or task-wide skip request; use the prefix on every turn when you need predictable local bypass. `FLUENTLOOP_DISABLED=1` in the host process environment disables FluentLoop output entirely.

## What it can and cannot do

- Coaching uses the language abilities of your existing assistant. Feedback defaults to simple English, with a brief native-language explanation when the model can provide one.
- The optional gate uses a small, fixed vocabulary to recognize some requests in another language. Coverage is limited: it does not support every language or reliably identify non-English text. Dialects, inflections, mixed language and different scripts may be missed. English mistakes pass through to model-guided coaching.
- Fenced/inline code, quotes, common log lines, paths and slash commands are excluded conservatively. Unmarked pasted content can still be mistaken for your prose. Use fences or the skip prefix.
- Urgent-help keywords skip coaching, but no keyword list covers every emergency. The policy also asks the model never to delay urgent help.
- Existing coaching instructions and other hooks may still apply. FluentLoop does not edit `AGENTS.md`, `CLAUDE.md`, trust, permissions, credentials or other hooks.

## Privacy and maintenance

The hook reads the event from standard input and a bundled policy file. It does not read `transcript_path`, session directories, credentials or project files; it makes no network calls and writes no prompts, logs or state. Inputs over 1 MiB or malformed events produce `{}` (skip coaching).

Your host assistant still handles prompts under its own data and retention settings. Context injection uses tokens in that existing conversation; FluentLoop's hook itself does not make a paid model request.

Setup/removal preserves unrelated JSON values and hooks, but reformats a changed JSON file with two-space indentation. The preview shows only FluentLoop's paths and hook definitions, not unrelated settings. Modified or unrecognized FluentLoop handlers trigger a refusal. A multi-tool operation checks all targets first; if a later write fails, it reports completed targets so you can safely rerun it.

## Project map

```text
adapters/             Codex and Claude executable entry points
bin/fluentloop.cjs    Guided init, uninstall, help and local demo
src/setup.cjs         Tool selection, path detection and confirmation
src/runtime.cjs       Persistent bundled runtime, independent of npm cache
src/engine.cjs        Shared prose filtering and optional gate
src/protocol.cjs      Bounded stdin and hook JSON protocol
src/install.cjs       Explicit-target JSON merge/removal
policy/coaching.md   Shared model-facing coaching policy
examples/prompts.json Synthetic input examples
test/                 Unit, subprocess and fixture installer tests
scripts/              Offline packed-package verification
docs/                 Quickstart, smoke checklist and validation status
```

Read [validation status](docs/validation.md) for exactly what has been tested, [Claude smoke tests](docs/claude-smoke-test.md) before claiming live compatibility, and [publication steps](docs/publishing.md) before releasing. See the [MIT license](LICENSE) and [distribution notes](LICENSE-GUIDANCE.md).

The adapter protocol follows the current [Codex UserPromptSubmit documentation](https://learn.chatgpt.com/docs/hooks#userpromptsubmit) and [Claude Code hook reference](https://code.claude.com/docs/en/hooks#userpromptsubmit). FluentLoop is an independent project, not an official OpenAI or Anthropic product.
