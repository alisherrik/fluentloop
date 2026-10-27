# Quickstart

## 1. Run locally

Clone the public source repository, then open a terminal in the checkout. Keep it in a stable path; no global npm installation is needed.

```sh
git clone https://github.com/alisherrik/fluentloop.git
cd fluentloop
node --version
node bin/fluentloop.cjs --help
node bin/fluentloop.cjs demo
node --test
```

Node 22+ is the intended runtime. Only the versions in [validation.md](validation.md) have been exercised. Use a host version with the documented `UserPromptSubmit` hook support; there is no verified minimum host version yet.

## 2. Choose one target

| Scope | Codex | Claude Code |
| --- | --- | --- |
| Project | `<project>/.codex/hooks.json` | `<project>/.claude/settings.local.json` |
| User-wide | `~/.codex/hooks.json` | `~/.claude/settings.json` |

Choose project scope first for a trial. Pass the real path, not the literal `<project>` or an unexpanded `~`. If using a custom Codex home, target its hooks file explicitly. FluentLoop does not discover or change additional configuration layers. Avoid installing the same adapter at both project and user scope: Codex can run hooks from multiple layers.

The installer requires plain JSON. Invalid JSON, comments, trailing commas, unexpected hook shapes, linked paths, or edited FluentLoop definitions are refused. Make a backup outside any shared repository if desired; the installer creates no backup containing your settings.

### Windows PowerShell

From the FluentLoop checkout, choose a disposable project you own:

```powershell
node bin/fluentloop.cjs install claude --config "C:/Projects/english-demo/.claude/settings.local.json" --dry-run
node bin/fluentloop.cjs install claude --config "C:/Projects/english-demo/.claude/settings.local.json"

node bin/fluentloop.cjs install codex --config "C:/Projects/english-demo/.codex/hooks.json" --dry-run
node bin/fluentloop.cjs install codex --config "C:/Projects/english-demo/.codex/hooks.json"
```

For an intentional user-wide install, replace the target with `"$HOME/.claude/settings.json"` or `"$HOME/.codex/hooks.json"`. The tool never assumes this scope.

Claude's adapter uses the documented executable-plus-arguments form with `node` and a separate script path. Codex uses a quoted command string. For Codex, checkout paths may contain letters, digits, spaces, `_`, `-`, `.`, `/`, `:`, `~` (including Windows short paths), and parentheses; shell-active characters are rejected. Move the checkout to a simple path before installation if needed. The settings-file path is separate and is never placed in a shell command.

### macOS / Linux shell

```sh
node bin/fluentloop.cjs install claude --config "$HOME/Projects/english-demo/.claude/settings.local.json" --dry-run
node bin/fluentloop.cjs install claude --config "$HOME/Projects/english-demo/.claude/settings.local.json"
node bin/fluentloop.cjs install codex --config "$HOME/Projects/english-demo/.codex/hooks.json" --dry-run
node bin/fluentloop.cjs install codex --config "$HOME/Projects/english-demo/.codex/hooks.json"
```

These platforms remain untested. Generated settings contain a machine-local absolute path; share the checkout and instructions, not generated local settings.

## 3. Review activation

Start the host in your chosen project and inspect `/hooks`. Check the adapter path and event. Complete the host's normal review yourself if you choose to activate it. Codex may require review again after a hook definition changes. FluentLoop does not set trust, bypass trust, change host permissions, or launch the host.

Use [the Claude checklist](claude-smoke-test.md) to record the actual behavior. Merely installing JSON or running an adapter directly does not prove live activation. Restart after settings changes if the host has not reloaded them.

## 4. Pick a coaching mode

```sh
node bin/fluentloop.cjs install claude --config "/path/to/settings.local.json" --mode english-first --dry-run
node bin/fluentloop.cjs install claude --config "/path/to/settings.local.json" --mode english-first
```

Use the same tool and target you selected earlier; replace the sample path. Re-run with `--mode coach` to restore the default. Both modes offer `[fluentloop:skip]` and `[fluentloop:retry]` prefixes. A retry is a declared coaching preference, not a tracked counter. The engine stores no task or session state.

## 5. Uninstall

From the same checkout, targeting the same settings file:

```sh
node bin/fluentloop.cjs uninstall claude --config "/path/to/settings.local.json" --dry-run
node bin/fluentloop.cjs uninstall claude --config "/path/to/settings.local.json"
node bin/fluentloop.cjs uninstall codex --config "/path/to/hooks.json" --dry-run
node bin/fluentloop.cjs uninstall codex --config "/path/to/hooks.json"
```

Only exact FluentLoop handlers for this checkout are removed, including exact duplicates. Other handlers in the same group survive. Empty containers created by removal are pruned; the settings file is retained, possibly as `{}`. Repeated removal is safe. No source files or host trust records are deleted. Restart the host if necessary.

If you edited the generated handler/group or moved the checkout, automatic changes stop. Restore the original definition and use its original checkout, or manually remove only the reviewed FluentLoop handler. Do not delete an entire settings file or a group containing other hooks.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No coaching | `/hooks`, host version, selected settings scope, trusted project, correct path, `node` on the host PATH, and `FLUENTLOOP_DISABLED` |
| Gate misses a language | Expected for unsupported words/languages; use model-guided mode |
| Gate blocks pasted text | Fence the pasted code/log or use `[fluentloop:skip]` |
| Assistant keeps asking for rewrites | Start the complete request with `[fluentloop:retry]`; other instructions may also apply |
| Duplicate coaching | Check all active hook sources and any existing coaching instructions yourself |
| Installer reports `EEXIST` | Another installer may be active. After it finishes, retry. Remove only the adjacent `.fluentloop.lock` if you have verified it is stale |
| Host does not understand Claude `args` | Update to a host supporting the documented exec form, or leave FluentLoop uninstalled; no older-shell fallback is claimed |

Hook policy updates take effect when the adapter next reads its policy file. Review changes before updating a checkout that an active hook executes.
