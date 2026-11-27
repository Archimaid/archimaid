# Contributing

Thanks for helping improve Archimaid. This guide covers setup, checks, and the conventions a change should follow. Read [FOUNDATION.md](FOUNDATION.md) for the design and [README.md](README.md) for the language.

## Setup

Use Node.js 22.12 or later.

```sh
npm ci
npx playwright install chromium
```

## Checks

Run these before opening a pull request. CI runs the same commands.

| Command | What it checks |
| --- | --- |
| `npm run lint` | ESLint and Prettier |
| `npm run typecheck` | TypeScript, without emitting files |
| `npm test` | Builds, then runs the language, CLI and layout tests |
| `npm run test:browser` | Renders through a real Mermaid host in Chromium |

Run `npm run format` to apply Prettier. The bundler consumer tests skip locally until their fixtures are installed: run `npm install --no-package-lock` in `test/consumers/vite`, `webpack` and `rollup`.

## Making a change

- Keep a pull request to one concern, and a commit to one logical step.
- Add or update a test with every behaviour change. Language changes go in `test/language.test.mjs`, CLI changes in `test/cli.test.mjs`, and rendering changes in `test/browser/`. Browser tests share their helpers in `test/browser/helpers.mjs`.
- When a change affects the syntax, update `README.md`, `skills/archimaid/SKILL.md` and the examples in the same pull request. A test parses every `archimate-beta` example in the README and the skill.
- Do not suppress type errors or delete failing tests.
- Write commit subjects in the imperative mood, for example "Wrap long relationship labels", and explain why in the body when it is not obvious.

## Adding an element type

1. Add the type to `elementTypes` in `src/archimate/catalogue.ts` with its name, description, layer, aspect, outline and icon. Add a new icon to `icons` if no existing figure fits.
2. Run `npm run reference` to regenerate `docs/reference.md` and the element table in the agent skill.
3. Run `npm run render:preview` to regenerate `examples/element-preview.svg`, and check the new figure.
4. Run all checks.

## Releasing

Releases are published by `.github/workflows/release.yml` when a `vX.Y.Z` tag is pushed. The workflow checks that the tag matches `package.json`, runs `npm test`, copies the `## X.Y.Z` section of `CHANGELOG.md` into the GitHub release, and publishes to npm with provenance. Everything below must be true on `main` before the tag goes up. If a step does not apply, say why in the pull request.

### 1. Scope and version

- [ ] List what the release contains: `git log --oneline $(git describe --tags --abbrev=0)..origin/main`, plus the release branch.
- [ ] Choose the version with the maintainer. While the version is 0.x, syntax changes take a minor bump; fixes and backwards-compatible additions to the API can take a patch.
- [ ] Bump with `npm version X.Y.Z --no-git-tag-version`, so `package.json` and `package-lock.json` change together.

### 2. Documentation

- [ ] `CHANGELOG.md` has a section headed exactly `## X.Y.Z` above the previous release; the release workflow fails without it. Group entries under the existing headings (`Language`, `Rendering`, `Command line`, `Examples`, `Project`) and name new exports, options, and error or warning codes.
- [ ] `README.md` covers every user-facing change: the syntax sections, `Host integration` for plugin options, and `Language API` for new exports or result fields.
- [ ] `skills/archimaid/SKILL.md` covers syntax or validation changes an agent needs. The copy in the [Claude plugin](https://github.com/Archimaid/claude-plugin) gets the same change after the release.
- [ ] Catalogue changes: `npm run reference` has regenerated `docs/reference.md` and the element table in the skill.
- [ ] Example changes: each `.mmd` file in `examples/` matches its rendered `.svg`. Element figure changes: `npm run render:preview`.
- [ ] A `docs/proposal-*.md` that the release implements says so in its status.
- [ ] This guide and `FOUNDATION.md` still describe how the code works.
- [ ] Links point to [try.archimaid.org](https://try.archimaid.org) for the designer and [archimaid.org](https://archimaid.org) for the site. The site reads the version from `package.json`; edit `site/` only to advertise something new.

### 3. Checks

- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:browser` pass.
- [ ] `npm pack --dry-run` lists the new files and nothing private.

### 4. Pull request

- [ ] The version bump and changelog are merged into `main` through a pull request with CI green: lint, and tests on Node 22 and 26, including browser, bundler consumer and pack checks.

### 5. Tag and publish

Pushing the tag publishes to npm and cannot be undone.

- [ ] On an up-to-date `main`, `node -p 'require("./package.json").version'` prints `X.Y.Z`.
- [ ] `git tag -a vX.Y.Z -m vX.Y.Z` on the merge commit, then `git push origin vX.Y.Z`.
- [ ] The `Release` workflow succeeded, `npm view archimaid version` prints `X.Y.Z`, and `gh release view vX.Y.Z` shows the changelog section.

### 6. Downstream

- [ ] [Archimaid Designer](https://github.com/Archimaid/designer) depends on the new version. Write its lockfile with npm 10 (`npx npm@10.9.2 install --package-lock-only`), because Cloudflare builds with npm 10. Its `main` deploys to try.archimaid.org.
- [ ] The Claude plugin's copy of `SKILL.md` matches, if the skill changed.

## Reporting a problem

Open an issue with the bug report template and include a minimal diagram that reproduces the problem. Report security issues privately, as described in [SECURITY.md](SECURITY.md).
