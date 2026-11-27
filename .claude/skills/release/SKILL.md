---
name: release
description: Checklist for preparing and publishing an archimaid npm release (version bump, CHANGELOG, README, agent skill, examples, CI, tag, downstream bumps). Use when the user asks to release, publish, cut, tag or prepare a version of archimaid, or to bump the package version.
---

# Releasing archimaid

The checklist lives in the `Releasing` section of `CONTRIBUTING.md`, so every maintainer follows the same
one. Read that section now and put each of its boxes in your task list. Work through them in order, and
say explicitly when a box does not apply and why.

What only applies to you:

- Agree the version number with the maintainer before writing it anywhere.
- Format only the paths you changed. Don't run `npm run format`, which also rewrites untracked files in the checkout.
- Never merge the release pull request yourself unless asked.
- Ask the maintainer before pushing the tag: it publishes to npm and cannot be undone.
- For downstream work, the designer is checked out at `../archimaid-designer` and the Claude plugin at `../archimaid-claude-plugin`.
- Afterwards, update the project memory with the released version and anything still pending.

If the checklist and the repository disagree, for example a workflow or script changed, fix `CONTRIBUTING.md` in the release pull request rather than working around it.
