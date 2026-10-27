# Validation status

Recorded on **2026-10-27**. These are results from this implementation, not historical tests of a personal hook.

## Completed

| Check | Result |
| --- | --- |
| `node --test --test-reporter=spec` | **127 passed, 0 failed, 0 skipped** |
| Environment | Windows NT 10.0.26200.0; Node v26.0.0; PowerShell 7.6.9; npm 11.12.1 |
| Both adapter executables | Synthetic JSON input/output exercised in Node child processes |
| Codex generated command | Executed through Windows `cmd.exe` and Windows PowerShell from a checkout path containing spaces and a Windows short-path segment |
| Claude generated exec form | Executed through direct Node subprocess arguments, including a checkout path with spaces, apostrophe, dollar sign and ampersand |
| Installer | Both tools tested in isolated temporary HOME/config fixtures through library, guided input and CLI entry points |
| Isolation | No active tool install, trust change or model/API request performed |
| Source hygiene | File inventory, personal-data/credential-indicator scan and whitespace check reviewed |
| `npm run test:package` | v0.2.0: 18 allowlisted packed files; local tarball install, Windows command shim and offline npm exec verified; no registry publication |
| Runtime durability | Both adapter commands still work after the test removes the installed npm package and npm cache |

Coverage includes malformed/wrong-event/BOM/oversized inputs; conservative code, log, quote and command exclusions; limited non-English detection using selected fixtures; English retry and explicit bypass; disable switch; urgency escape; duplicate installs and removals; mode switches; preserved foreign hooks/settings; malformed settings; edited or differently located hooks; locked settings; hardlinks and linked directories; and Windows path quoting. The fixtures verify specific recognized patterns, not support for every language.

Guided setup tests additionally cover all three tool choices, invalid selection, default-No confirmation, cancellation/EOF, zero-write dry runs, custom config-directory variables, project scope, explicit config paths, legacy checkout migration, older runtime migration, modified runtimes, linked runtime storage and reporting partial multi-file completion. The package check uses temporary npm cache/config/install locations and offline tarball-based `npm exec`; no real user settings are used.

The Windows sandbox initially prevented child-process tests (`spawn EPERM`). The suite then ran with permission to spawn local processes, using only synthetic fixtures. Two issues found during testing were corrected: handling Windows short-path `~` segments and the test harness's command-shell argument quoting. The final complete run above passed.

For package checks on Windows, npm creates the executable `.cmd` shim. Windows does not expose a POSIX execute bit, so that shim is tested directly; the Git-tracked CLI also has executable mode for Unix checkouts. Actual Unix command execution remains untested.

## Not completed / not claimed

- **Live Claude Code activation and model behavior:** not tested. Installed version observed with `--version`: 2.1.260. This is version discovery only. The [manual checklist](claude-smoke-test.md) remains for an independent run.
- **Live Codex CLI activation and model behavior:** not tested. Installed version observed with `--version`: codex-cli 0.133.0. This is not a compatibility certification.
- macOS, Linux, other Node versions, and older host versions: not exercised. Node 22+ is the intended baseline, not a tested matrix.
- No trusted-hook review was performed. Existing user settings and instructions were not changed; the three inspected source files had identical SHA-256 values before and after implementation.
- No cloud orchestration compatibility, universal grammar accuracy, reliable language identification, or deterministic model obedience is claimed.
- Public GitHub distribution at `alisherrik/fluentloop` and the MIT license were subsequently approved by the owner. npm publication remains out of scope; no package has been published. No CI workflow is included, so the local fixture suite remains the automated validation evidence.

## Protocol references

The current documentation was consulted on 2026-10-27:

- [Codex hooks](https://learn.chatgpt.com/docs/hooks#userpromptsubmit): event input/output, configuration layers and review requirements.
- [Claude Code hooks](https://code.claude.com/docs/en/hooks#userpromptsubmit): event input/output and executable-plus-arguments configuration.
- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and [Claude Code memory](https://code.claude.com/docs/en/memory): instruction-file context. FluentLoop does not install or edit these files.

The adapters share the documented JSON response contract. Host-specific installation remains separate. Documentation review and direct subprocess tests do not substitute for testing the hook inside an actual host session.
