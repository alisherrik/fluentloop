# Quickstart

## One command from GitHub

Install Node.js 22+ (with npm) and Git, then run:

```sh
npx github:alisherrik/fluentloop init
```

npm may ask to download the package. FluentLoop then asks which tool to set up: **Codex CLI**, **Claude Code**, or **both**. It shows the selected paths, runtime copy and exact hook definition before asking `Apply these changes? [y/N]`. Only `y` or `yes` applies changes. A blank response, `n`, or end of input writes nothing.

Default scope is **user**, across your projects. The chooser marks an existing settings file as “settings found”; this does not prove the host is installed or its hook is active.

**This project is not published to the npm registry.** `npx fluentloop init` is an intended future shortcut, pending a separate registry release. Use the GitHub command above today. GitHub source is fetched from `main`; to pin a reviewed commit, use `npx github:alisherrik/fluentloop#<commit> init` with a real commit SHA.

If you prefer a reusable global command:

```sh
npm install --global github:alisherrik/fluentloop
fluentloop init
```

Package installation alone does not edit any host settings. There are no install lifecycle scripts. Avoid administrator privileges unless your own npm setup requires them; `npx` avoids a global package install.

## Review activation in your host

Open `/hooks` in the selected coding tool, review the adapter and complete the host's ordinary activation/trust process yourself if you choose. Restart the host if it has not reloaded settings. FluentLoop never approves trust, changes permissions or launches a model session. Follow the [Claude smoke checklist](claude-smoke-test.md) for a live check.

## Useful commands

The examples below use `fluentloop` after a global install. With no global install, replace it with `npx github:alisherrik/fluentloop`. From a source checkout, use `node bin/fluentloop.cjs`.

```sh
fluentloop init --tool both --dry-run
fluentloop init --tool claude --scope project
fluentloop init --tool codex --mode english-first
fluentloop init --tool both --yes
fluentloop uninstall
fluentloop uninstall --tool both --dry-run
fluentloop uninstall --tool both --yes
```

`--yes` is explicit noninteractive confirmation, not a host trust bypass. It requires `--tool`; the preview still prints. `--dry-run` also requires `--tool` and writes neither runtime nor settings. Default mode is `coach`; `english-first` adds only a limited non-English vocabulary gate. Both support `[fluentloop:skip]` and `[fluentloop:retry]` at the start of your complete request.

## Where setup writes

| Scope | Codex | Claude Code |
| --- | --- | --- |
| User (default) | `~/.codex/hooks.json` | `~/.claude/settings.json` |
| Project | `<project>/.codex/hooks.json` | `<project>/.claude/settings.local.json` |

User scope respects `CODEX_HOME` and `CLAUDE_CONFIG_DIR` when set. On Windows, the default home comes from `USERPROFILE`; on macOS/Linux it comes from the OS home directory. `--home <folder>` selects an alternate home; explicit config-directory environment variables still take precedence. No transcript or session-history directory is read.

Project scope uses the current directory, or the explicit `--project` folder. Run from your project root; worktree/shared host settings can have different precedence. The preview is the source of truth for the files FluentLoop will touch. Keep generated local settings out of commits yourself; FluentLoop does not edit `.gitignore` or Git configuration.

To choose a specific file:

```sh
fluentloop init --tool claude --config "C:/Projects/demo/.claude/settings.local.json"
fluentloop init --tool codex --scope project --project "/path/to/project"
```

`--config` requires a single tool. The advanced aliases `install codex --config <file>` and `uninstall codex --config <file>` remain available, and now also require confirmation or `--yes` before writes.

## Runtime portability and updates

After confirmation, setup copies only the bundled adapters, engine, protocol, policy and MIT license into `~/.fluentloop/runtimes/<content-hash>`, with a small ownership manifest. There are no prompt logs or personal configuration copies. Use `--data-dir <folder>` to choose another location; reuse it for later setup/removal.

Runtime directories are immutable: existing files are verified, and different bundled content gets a new directory. Re-running setup updates recognized older runtime hooks only in the selected settings. Other scopes keep their prior runtime until you run setup there too. Review the resulting hook change in the host. Modified runtimes/handlers or unrecognized checkout references are refused rather than overwritten.

Clearing npm's cache, uninstalling the CLI package, or moving your source checkout does not break a runtime-backed hook. Node must remain on the host's `PATH`. Claude uses executable-plus-arguments hooks; Codex uses a quoted command string. Codex's runtime path permits letters, digits, spaces, `_`, `-`, `.`, `/`, `:`, `~` and parentheses. If your home contains shell-active characters, choose a simple `--data-dir` path. macOS/Linux and older host versions remain untested.

## Safe removal

Run `fluentloop uninstall`, select the tools, review and confirm. For project scope or overrides, pass the same `--scope`, `--project`, `--config`, `--home` or `--data-dir` options you used to set up. Removal affects only the selected files; it does not search every project on your disk.

Only exact recognized FluentLoop handlers are removed, including duplicates. Other hooks and settings remain; changed JSON is reformatted with two-space indentation. Empty hook containers are pruned and the settings file may remain as `{}`. Repeated removal is safe. Runtime directories are intentionally retained because other scopes may reference them. Remove runtime storage manually only after removing all references. No host trust records are deleted.

All selected targets are checked before any write. Settings are replaced atomically one file at a time; setup is not a cross-file transaction. If a later write fails (for example, another installer holds a lock), the CLI lists completed targets. Fix the issue and rerun safely.

For v0.1 checkout-based installs, running v0.2 `init` from the original checkout can migrate that checkout's hooks. If a new package cannot recognize the old reference, use the original checkout to uninstall it first, or manually remove only its reviewed handler. Do not remove whole groups containing other hooks.

## Local package verification, no registry required

From a source checkout:

```sh
node --test
npm run test:package
```

The package check packs the source, installs it into a temporary prefix, executes its command shim and uses offline `npm exec` with the tarball. It exercises dry-run, setup, duplicate setup and removal in an isolated home, and verifies both hooks after removing the npm cache and installed package.

To pack and try it yourself:

```sh
npm pack --ignore-scripts
npm exec --yes --package ./fluentloop-0.2.0.tgz -- fluentloop init
```

Here npm's `--yes` accepts the package download/install; FluentLoop still asks before writing settings. No npm registry publication is needed. The package retains `private: true` to prevent accidental publication.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No coaching | `/hooks`, host version, selected scope, trust review, Node on the host PATH, and `FLUENTLOOP_DISABLED` |
| Input ended before confirmation | Use a terminal, or supply explicit `--tool` and `--yes` for a script |
| Unexpected target | Check scope, `--project`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR` and the preview |
| Invalid JSON or edited hook | Fix the selected file or review the changed handler; no automatic overwrite |
| `EEXIST` lock error | Wait for the other installer; remove an adjacent `.fluentloop.lock` only after verifying it is stale |
| Gate misses a request | Expected for unsupported vocabulary; use model-guided `coach` mode |
| Host does not understand Claude `args` | Use a host supporting the documented exec form; no older-shell fallback is claimed |

See [validation status](validation.md) for the exact tested versions and remaining live-test limits.
