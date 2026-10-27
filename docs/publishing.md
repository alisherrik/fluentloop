# Publication checklist

The owner approved public GitHub distribution at **alisherrik/fluentloop** under **MIT**. npm publication is outside this release; `private: true` remains in package metadata. Use this checklist for subsequent releases too.

- [x] Confirm the GitHub owner, repository name and public visibility: `alisherrik/fluentloop`.
- [x] Add the approved [MIT license](../LICENSE), copyright 2026 `alisherrik`; see [distribution notes](../LICENSE-GUIDANCE.md).
- [ ] Review `git ls-files` and `git diff --cached`. Share only source, synthetic examples/tests and documentation.
- [ ] Confirm there are no personal hooks, host configuration, credentials, environment files, local logs, backups or session histories. `.gitignore` is a convenience, not a substitute for review.
- [ ] Check author metadata. Use a verified public/noreply identity if personal email disclosure is unwanted.
- [ ] Run `node --test` and review [validation.md](validation.md). Do not turn fixture results into live host compatibility claims.
- [ ] Complete the manual Claude checklist and record the actual host/version outcomes before advertising live validation. Test Codex activation separately too.
- [ ] Inspect `npm pack --dry-run --ignore-scripts` for a package file preview. The MIT-licensed package is intentionally marked private; do not publish it to npm now.
- [ ] Push only this standalone repository to the approved destination. Verify the remote commit, public visibility, README links, and exact-commit CI if workflows are present.

The runtime source, bundled policy and installer have no third-party dependencies. Current distribution is a source checkout. Generated hook settings contain machine-local paths and should not be committed as portable examples.
