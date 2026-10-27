# Claude Code manual smoke test

**Status: not performed.** This checklist is for an independent user-run session. It can use your normal host/model allowance; automated fixture tests do not.

Use a disposable coding project with no production secrets. Keep your normal permission settings. Do not enable blanket trust or permission bypass for this test.

## Record the environment

```text
Date:
OS and shell:
Node version:
Claude Code version:
FluentLoop commit:
Settings scope:
Hook review / reload steps:
```

## Local preflight (no model)

- [ ] Run `node --test` from the FluentLoop checkout.
- [ ] Dry-run a `claude` install into the disposable project's `.claude/settings.local.json`; confirm a single `UserPromptSubmit` handler with a `node` executable and separate `args`.
- [ ] Install `coach` mode, then repeat installation. The second result should say `changed: false`.
- [ ] Confirm unrelated settings/hooks remain. Do not include their private values in a report.
- [ ] Start Claude in the disposable project, review `/hooks`, and follow its normal review/restart process. Check the installed path and event.

## Interactive behavior

Use text-only tasks so language feedback can be inspected without a code change:

| Step | Submit | Observe |
| --- | --- | --- |
| Clear request | `Explain what a unit test does in one sentence.` | Short acknowledgement or explanation, without an unnecessary rewrite |
| Important error | `I wants you explain what unit test does.` | A correction and short explanation; at most one requested retry |
| Genuine retry | `I want you to explain what a unit test does.` | The assistant proceeds; it does not start another exercise |
| Explicit retry | `[fluentloop:retry] I want explain unit tests.` | Proceeds with at most one brief improvement |
| Explicit skip | `[fluentloop:skip] Explain unit tests without language feedback.` | Proceeds without coaching |
| Copied content | `Explain this log:` followed by a fenced `ERROR Menga login kodni tuzat` line | Does not correct the quoted log as your grammar |
| Non-work chat | `Hello, how are you?` | No coding-language exercise |

Model behavior can vary. Record missed or excessive coaching as behavior observations, not proof that the local hook failed.

## Optional gate

- [ ] Exit/reload as appropriate, preview and reinstall the same target with `--mode english-first`, and review the changed definition.
- [ ] Submit `Menga login kodni tuzat`. Expect the static FluentLoop block/rewrite cue and no assistant work on that blocked prompt.
- [ ] Submit `Исправь ошибку в коде`. Expect the same local block.
- [ ] Submit a **complete** English request: `[fluentloop:retry] Explain how to fix a login handler; do not edit files.` Expect processing to continue.
- [ ] Submit `[fluentloop:skip] Menga login kodni tuzat`. Expect no FluentLoop local block. The assistant still follows normal permissions and other instructions.
- [ ] Repeat an unprefixed Uzbek request to verify the hook is stateless and can block again. Do not assume a previous skip persists locally.
- [ ] Test a quoted/fenced non-English sample. It should not trigger the local gate by itself.

## Remove and report

- [ ] Dry-run and uninstall from the same checkout/target. Repeat removal: `changed: false`.
- [ ] Review the remaining JSON and confirm unrelated hooks/settings survived.
- [ ] Restart/reload Claude, confirm FluentLoop is absent in `/hooks`, and check that its added coaching stops.
- [ ] Report versions, commit, expected/observed outcomes and sanitized errors only. Do not share settings files, credentials, logs, session-history directories or transcripts.

If activation fails, leave live compatibility marked **unverified**. Do not compensate by enabling blanket trust or editing unrelated personal instructions.
