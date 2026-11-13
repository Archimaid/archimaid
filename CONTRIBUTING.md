# Contributing

Thanks for helping improve ArchiMate for Mermaid. This guide covers setup, checks, and the conventions a change should follow. Read [FOUNDATION.md](FOUNDATION.md) for the design and [README.md](README.md) for the language.

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
- When a change affects the syntax, update `README.md`, `skills/archimate-mermaid/SKILL.md` and the examples in the same pull request. A test parses every `archimate-beta` example in the README and the skill.
- Do not suppress type errors or delete failing tests.
- Write commit subjects in the imperative mood, for example "Wrap long relationship labels", and explain why in the body when it is not obvious.

## Adding an element type

1. Add the type to `elementTypes` in `src/archimate/catalogue.ts` with its name, description, layer, aspect, outline and icon. Add a new icon to `icons` if no existing figure fits.
2. Run `npm run reference` to regenerate `docs/reference.md` and the element table in the agent skill.
3. Run `npm run render:preview` to regenerate `examples/element-preview.svg`, and check the new figure.
4. Run all checks.

## Reporting a problem

Open an issue with the bug report template and include a minimal diagram that reproduces the problem. Report security issues privately, as described in [SECURITY.md](SECURITY.md).
