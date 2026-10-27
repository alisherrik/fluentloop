# Publication checklist

This checkout is prepared locally. Remote creation, public push, npm publication and license selection require a separate owner decision. This document does not authorize them.

- [ ] Confirm the exact GitHub owner, repository name and public/private visibility. Availability checks are only a point-in-time observation, not a reservation or a naming-rights claim.
- [ ] Confirm the license and copyright holder using [license guidance](../LICENSE-GUIDANCE.md). Do not call the project open source until a suitable license has been approved and added.
- [ ] Review `git ls-files` and `git diff --cached`. Share only source, synthetic examples/tests and documentation.
- [ ] Confirm there are no personal hooks, host configuration, credentials, environment files, local logs, backups or session histories. `.gitignore` is a convenience, not a substitute for review.
- [ ] Check author metadata. Use a verified public/noreply identity if personal email disclosure is unwanted.
- [ ] Run `node --test` and review [validation.md](validation.md). Do not turn fixture results into live host compatibility claims.
- [ ] Complete the manual Claude checklist and record the actual host/version outcomes before advertising live validation. Test Codex activation separately too.
- [ ] Inspect `npm pack --dry-run --ignore-scripts` for a package file preview. The package is intentionally private and unlicensed; do not publish it now.
- [ ] After approval, create only the confirmed remote and push only this standalone repository. Do not add personal settings or a different project's files.

The runtime source, bundled policy and installer have no third-party dependencies. Current distribution is a source checkout. Generated hook settings contain machine-local paths and should not be committed as portable examples.
