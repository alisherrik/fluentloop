# FluentLoop

**Practise English while you build.**

Small, local English-coaching hooks for **Codex CLI** and **Claude Code**. Write a coding request, get a little language feedback, try once, and keep working.

No runtime dependencies. No separate model API. No prompt database. One shared policy, two adapters.

MIT-licensed and distributed as a source checkout. The package remains private to prevent accidental npm publication. The name carries no availability or trademark claim.

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
| `english-first` | Also blocks a small set of recognizable Uzbek/Russian work requests | Coach prompts that pass the local heuristic |

The local gate **does not check English grammar**. If it blocks, the prompt never reaches the model: only a static rewrite cue is shown. Model-guided coaching is fallible and cannot guarantee that an assistant waits, gives correct feedback, or obeys every coaching preference.

## Try it without installing

Requires Git and Node.js 22 or newer:

```sh
git clone https://github.com/alisherrik/fluentloop.git
cd fluentloop
node bin/fluentloop.cjs demo
node --test
```

These commands use synthetic examples and no model calls. There is nothing to download with `npm install`.

## Install deliberately

Keep this checkout in a stable location. FluentLoop references its adapter by absolute path; it does not copy itself into your home folder. Node must be on the coding tool's `PATH`.

For a project-local Claude setup, run from the FluentLoop checkout and replace the example path:

```sh
node bin/fluentloop.cjs install claude --config "/path/to/project/.claude/settings.local.json" --dry-run
node bin/fluentloop.cjs install claude --config "/path/to/project/.claude/settings.local.json"
```

For project-local Codex:

```sh
node bin/fluentloop.cjs install codex --config "/path/to/project/.codex/hooks.json" --dry-run
node bin/fluentloop.cjs install codex --config "/path/to/project/.codex/hooks.json"
```

On Windows, use paths such as `"C:/Projects/demo/.codex/hooks.json"`. See the [quickstart](docs/quickstart.md) for Windows, user-wide targets, activation and removal. **Settings installation is not proof of hook activation.** Review hooks in the host's `/hooks` interface and restart the host session as needed; FluentLoop never enables trust for you.

Add `--mode english-first` to both preview and install commands to opt into the limited gate. Run install again with `--mode coach` to change back. Repeating the same install is a no-op.

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
- The optional gate recognizes only selected Uzbek Latin-script words and Russian Cyrillic work requests. It is not a general language detector; dialects, inflections, mixed language and other scripts may be missed. English mistakes pass through to model-guided coaching.
- Fenced/inline code, quotes, common log lines, paths and slash commands are excluded conservatively. Unmarked pasted content can still be mistaken for your prose. Use fences or the skip prefix.
- Urgent-help keywords skip coaching, but no keyword list covers every emergency. The policy also asks the model never to delay urgent help.
- Existing coaching instructions and other hooks may still apply. FluentLoop does not edit `AGENTS.md`, `CLAUDE.md`, trust, permissions, credentials or other hooks.

## Privacy and maintenance

The hook reads the event from standard input and a bundled policy file. It does not read `transcript_path`, session directories, credentials or project files; it makes no network calls and writes no prompts, logs or state. Inputs over 1 MiB or malformed events produce `{}` (skip coaching).

Your host assistant still handles prompts under its own data and retention settings. Context injection uses tokens in that existing conversation; FluentLoop's hook itself does not make a paid model request.

Install/uninstall preserves unrelated JSON values and hooks, but reformats a changed JSON file with two-space indentation. Dry-run shows only the target and FluentLoop's own change. Edited FluentLoop handlers or handlers from a different checkout trigger a refusal so you can review them manually. Uninstall before moving or deleting this checkout.

## Project map

```text
adapters/             Codex and Claude executable entry points
bin/fluentloop.cjs    Install, uninstall, help and local demo
src/engine.cjs        Shared prose filtering and optional gate
src/protocol.cjs      Bounded stdin and hook JSON protocol
src/install.cjs       Explicit-target JSON merge/removal
policy/coaching.md   Shared model-facing coaching policy
examples/prompts.json Synthetic input examples
test/                 Unit, subprocess and fixture installer tests
docs/                 Quickstart, smoke checklist and validation status
```

Read [validation status](docs/validation.md) for exactly what has been tested, [Claude smoke tests](docs/claude-smoke-test.md) before claiming live compatibility, and [publication steps](docs/publishing.md) before releasing. See the [MIT license](LICENSE) and [distribution notes](LICENSE-GUIDANCE.md).

The adapter protocol follows the current [Codex UserPromptSubmit documentation](https://learn.chatgpt.com/docs/hooks#userpromptsubmit) and [Claude Code hook reference](https://code.claude.com/docs/en/hooks#userpromptsubmit). FluentLoop is an independent project, not an official OpenAI or Anthropic product.
