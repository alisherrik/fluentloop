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
- [ ] Run `node bin/fluentloop.cjs init --tool claude --scope project --project "/path/to/disposable-project" --dry-run`; confirm a single `UserPromptSubmit` handler with a `node` executable and separate `args`.
- [ ] Run the same command without `--dry-run`, review its paths and type `y`. Default mode is `coach`. Repeat setup; it should report `Already up to date`.
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
| Copied content | `Explain this log:` followed by a fenced `ERROR Login handler failed` line, or a copied log in another language | Does not correct the quoted log as your grammar |
| Non-work chat | `Hello, how are you?` | No coding-language exercise |

Model behavior can vary. Record missed or excessive coaching as behavior observations, not proof that the local hook failed.

## Optional gate

- [ ] Exit/reload as appropriate, preview and reinstall the same target with `--mode english-first`, and review the changed definition.
- [ ] Submit a short coding request in another language of your choice. If its words match the limited local vocabulary, expect the static FluentLoop block/rewrite cue and no assistant work on that blocked prompt. Otherwise, record a coverage gap; passing through does not establish that the request is English or that the hook is inactive.
- [ ] Submit a **complete** English request: `[fluentloop:retry] Explain how to fix a login handler; do not edit files.` Expect processing to continue.
- [ ] Resubmit your complete request with `[fluentloop:skip]` at the start. Expect no FluentLoop local block. The assistant still follows normal permissions and other instructions.
- [ ] If a request triggered the local gate, repeat it without a prefix to verify the hook is stateless and can block again. Do not assume a previous skip persists locally. If none triggered it, leave this check unverified; automated tests cover known matching fixtures.
- [ ] Test a quoted/fenced non-English sample. It should not trigger the local gate by itself.

## Remove and report

- [ ] Run `uninstall --tool claude --scope project --project "/path/to/disposable-project" --dry-run`, then repeat without `--dry-run` and confirm. Use the same home/data directory if you overrode them. Repeating removal should report `Already up to date`.
- [ ] Review the remaining JSON and confirm unrelated hooks/settings survived.
- [ ] Restart/reload Claude, confirm FluentLoop is absent in `/hooks`, and check that its added coaching stops.
- [ ] Report versions, commit, expected/observed outcomes and sanitized errors only. Do not share settings files, credentials, logs, session-history directories or transcripts.

If activation fails, leave live compatibility marked **unverified**. Do not compensate by enabling blanket trust or editing unrelated personal instructions.
