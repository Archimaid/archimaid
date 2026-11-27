---
name: release
description: Checklist for preparing and publishing an archimaid npm release (version bump, CHANGELOG, README, agent skill, examples, CI, tag, downstream bumps). Use when the user asks to release, publish, cut, tag or prepare a version of archimaid, or to bump the package version.
---

# Releasing archimaid

A release is published by `.github/workflows/release.yml` when a `vX.Y.Z` tag is pushed. The workflow
checks that the tag matches `package.json`, runs `npm test`, copies the `## X.Y.Z` section of
`CHANGELOG.md` into the GitHub release, and publishes to npm with provenance. Everything below has to be
true on `main` before the tag goes up. Work through it in order and tick every box in your task list;
say explicitly when a box does not apply and why.

## 1. Scope and version

- [ ] List what is in the release: `git log --oneline $(git describe --tags --abbrev=0)..origin/main` plus the release branch.
- [ ] Pick the version. While the version is 0.x: syntax changes take a minor bump; fixes and additive, backwards-compatible API take a patch, if the maintainer agrees. Agree the number with the maintainer before writing it anywhere.
- [ ] Bump with `npm version X.Y.Z --no-git-tag-version`, so `package.json` and `package-lock.json` both change. Never edit only one of them.

## 2. Information pieces

- [ ] `CHANGELOG.md` has a `## X.Y.Z` heading spelt exactly like that (the release workflow fails without it), above the previous release. Group entries under the existing headings (`Language`, `Rendering`, `Command line`, `Examples`, `Project`). Name new public exports, options and error or warning codes.
- [ ] `README.md` covers every user-facing change: the syntax sections, `Host integration` for plugin options, and `Language API` for new exports or result fields.
- [ ] `skills/archimaid/SKILL.md` covers syntax or validation changes that an agent writing diagrams needs. If it changed, note that the copy in `../archimaid-claude-plugin/skills/archimaid/` needs the same change (step 6).
- [ ] Catalogue changes: `npm run reference` regenerated `docs/reference.md` and the skill's element table.
- [ ] Example changes: the `.mmd` files and their rendered `.svg` files in `examples/` match. Element figure changes: `npm run render:preview`.
- [ ] A `docs/proposal-*.md` that the release implements says so in its status.
- [ ] `CONTRIBUTING.md` and `FOUNDATION.md` still describe how the code works.
- [ ] Links point at `https://try.archimaid.org` for the designer and `https://archimaid.org` for the site.
- [ ] The site reads the version from `package.json`; only edit `site/` when the release adds something the landing page should advertise.

## 3. Local checks

Run all of them from the repository root. They are the same commands CI runs.

- [ ] `npm run lint`. It also checks untracked files in the checkout, so a failure there is not the release's; format only the paths you changed rather than running `npm run format`.
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run test:browser` (needs `npx playwright install chromium`; the bundler consumer tests skip until their fixtures are installed, see `CONTRIBUTING.md`)
- [ ] `npm pack --dry-run`: the file list contains the new files and nothing private (no `.claude/`, proposals or backups).

## 4. Pull request and CI

- [ ] The work is on a branch, not `main`, and merged through a pull request with the version bump and changelog in it.
- [ ] CI is green on the pull request: `lint`, `test` on Node 22 and 26 (unit, browser, bundler consumers, `npm pack --dry-run`).
- [ ] The maintainer has merged the pull request. Do not merge it yourself unless asked.

## 5. Tag and publish

Pushing the tag publishes to npm and cannot be undone. Ask the maintainer before pushing it.

- [ ] `git fetch origin && git switch main && git pull --ff-only`, and `node -p 'require("./package.json").version'` prints `X.Y.Z`.
- [ ] `git tag -a vX.Y.Z -m vX.Y.Z` on the merge commit, then `git push origin vX.Y.Z`.
- [ ] The `Release` workflow succeeded: `gh run list --workflow release.yml --limit 1`.
- [ ] `npm view archimaid version` prints `X.Y.Z`, and `gh release view vX.Y.Z` shows the changelog section.

## 6. Downstream

- [ ] Archimaid Designer (`../archimaid-designer`, repo `Archimaid/designer`): bump `archimaid` to `X.Y.Z` on a branch. Write the lockfile with npm 10 (`npx npm@10.9.2 install --package-lock-only`), because Cloudflare builds with npm 10. Main deploys to try.archimaid.org.
- [ ] Claude plugin (`../archimaid-claude-plugin`): sync `skills/archimaid/SKILL.md` if it changed.
- [ ] Update the project memory with the released version and anything still pending.
