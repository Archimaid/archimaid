# ArchiMate for Mermaid

[![Version 0.1.0](https://img.shields.io/badge/version-0.1.0-blue)](package.json)
[![MIT license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node.js 22.12 or later](https://img.shields.io/badge/Node.js-%E2%89%A522.12-339933)](https://nodejs.org/)
[![Mermaid 12.3.0](https://img.shields.io/badge/Mermaid-12.3.0-ff3670)](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.3.0)
[![ArchiMate 3.2](https://img.shields.io/badge/ArchiMate-3.2-6d44ae)](https://publications.opengroup.org/standards/archimate/c226)

Write ArchiMate 3.2 diagrams in plain text, validate their structure in CI, and render them as SVG. This independent Mermaid plugin includes 60 element types, 11 relationship types, relationship-backed nesting, and notes. The `archimate-beta` syntax is experimental.

**Automatic relationship checks against ArchiMate 3.2 Appendix B are under development.** Their release depends on permission from The Open Group to distribute the relationship lookup.

![Application components and services supporting an order fulfilment process](examples/order-management.svg)

[Quick start](#quick-start) · [Examples](#examples) · [Host integration](#host-integration) · [Language API](#language-api) · [Coverage](#coverage) · [Development](#development) · [Sources](#sources)

## Quick start

Use Node.js 22.12 or later. From a checkout, install dependencies and validate a bundled example.

```sh
npm ci
npm run build
node dist/cli.js validate examples/order-fulfilment.mmd
```

The validator reports syntax and structural errors with their line and column. Use `-` as the input path to read from standard input.

To render a standalone SVG, install Playwright's Chromium browser and run the checkout's render command.

```sh
npx playwright install chromium
npm run render -- examples/order-fulfilment.mmd order-fulfilment.svg
```

## Examples

A diagram starts with `archimate-beta`. Give each element and relationship a stable ID, then reference those IDs when connecting or nesting elements.

```text
archimate-beta
  direction LR
  accTitle: Order fulfilment responsibilities
  accDescr: A fulfilment clerk is assigned to the fulfil order process.

  element businessRole clerk "Fulfilment clerk"
  element businessProcess fulfil "Fulfil order"
  relationship assignment clerk_to_fulfil clerk -> fulfil
```

Use `direction TB`, `BT`, `LR`, or `RL` to choose the layout direction. Add element details with `description elementId "Text"` and a visible relationship label with `label "Text"` after the relationship's endpoints and options.

| Example | What it shows | Files |
| --- | --- | --- |
| Order fulfilment | A Business Role assigned to a Business Process | [Source](examples/order-fulfilment.mmd) |
| Order management | Assignment, Realization, Serving, and read Access | [Source](examples/order-management.mmd) · [SVG](examples/order-management.svg) |
| Nested components | Composition shown as containment, edges crossing the boundary, and notes | [Source](examples/nested-components.mmd) · [SVG](examples/nested-components.svg) |
| Notation sheet | The element catalogue and examples of every relationship, including Access and Association variants | [SVG](examples/element-preview.svg) |

### Nest elements and add notes

Declare a relationship and give its ID to `nest child in parent via relationshipId`.

```text
archimate-beta
  element applicationComponent suite "Order management suite"
  element applicationComponent billing "Billing"

  relationship composition includes_billing suite -> billing
  nest billing in suite via includes_billing

  note review "Confirm retry behaviour" on suite
```

Nesting supports Composition, Aggregation, Assignment, Realization, and Access from parent to child. For Specialization, the child specializes its parent. The nesting declaration must reference a relationship between the named child and parent. Each child can have one visual parent. The enclosure represents the relationship and the renderer also draws its line when it carries a label or explicit read/write mode. [ArchiMate 3.2 specification, §§3.8, 5.1, 5.2.2, and 5.4.1](https://publications.opengroup.org/standards/archimate/c226)

Use `note id "Text"` for a standalone note or `note id "Text" on elementId` to attach it to an element's top edge. Notes are diagram annotations and can be endpoints of the supported relationship types. Use `\n` for a line break.

## Host integration

Build a local package archive with `npm pack` in the plugin checkout. In your host project, install that archive with Mermaid 12.3.0.

```sh
npm install mermaid@12.3.0 /path/to/archimate-for-mermaid-0.1.0.tgz
npm exec -- archimate validate diagram.mmd
```

Add a `<div id="diagram"></div>` to your page and run this module through your JavaScript bundler.

```js
import mermaid from 'mermaid';
import { archimate } from 'archimate-for-mermaid';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
await mermaid.registerExternalDiagrams([archimate]);

const source = `archimate-beta
  direction LR
  element businessRole clerk "Fulfilment clerk"
  element businessProcess fulfil "Fulfil order"
  relationship assignment clerk_to_fulfil clerk -> fulfil`;

const { svg } = await mermaid.render('order-fulfilment', source);
document.querySelector('#diagram').innerHTML = svg;
```

Live rendering requires a host that registers the external diagram. For GitHub Markdown, commit the `.mmd` source alongside its exported SVG and link to the SVG with `![Diagram title](order-fulfilment.svg)`. This keeps the model reviewable in Git and the image visible to readers. [Mermaid external diagram API](https://mermaid.js.org/config/setup/mermaid/interfaces/Mermaid.html#registerexternaldiagrams)

Use the DSL's `title:`, `accTitle:`, and `accDescr:` declarations if the same file must pass the standalone validator. Mermaid YAML frontmatter is processed by the host before the plugin sees the source. To show a Mermaid directive as literal text in a quoted label, escape its percent signs as `\u0025`.

## Language API

Use the language entry point to validate or inspect a diagram in Node.js without a browser.

```js
import { readFile } from 'node:fs/promises';
import { parseArchiMate } from 'archimate-for-mermaid/language';

const source = await readFile('diagram.mmd', 'utf8');
const model = parseArchiMate(source);
console.log(model.elements);
```

Validation errors throw `ArchiMateError` with a code, line, and column. The same entry point exports `elementTypes` and `relationshipTypes` for tooling that needs the catalogue.

## Coverage

The renderer supports the default figures for all 60 concrete elements and all 11 relationship types in the bundled catalogue. Access accepts `access read`, `access write`, `access readWrite`, or `access unspecified`. Use `directed` for a directed Association. [Notation preview](examples/element-preview.svg)

The validator checks syntax, declared endpoints, supported element and relationship types, relationship options, and nesting. Check the specification to verify which element types a relationship can connect. [ArchiMate 3.2 specification, Appendix B](https://publications.opengroup.org/standards/archimate/c226)

Junctions, relationship-to-relationship endpoints, alternative element figures, viewpoint tooling, and model exchange are outside the current scope.

## Development

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm pack --dry-run
```

Use `npm run typecheck` to check TypeScript without emitting files and `npm run render:preview` to regenerate the notation sheet. The browser tests exercise the plugin through a real Mermaid host.

For contributions, check the design notes, update tests for language or rendering changes, and include a minimal diagram when reporting a problem. To generate or edit diagrams with an agent, point it to the repository skill. It covers syntax, relationship direction, and validation commands. [Foundation](FOUNDATION.md) · [Agent skill](skills/archimate-mermaid/SKILL.md)

## Sources

- The Open Group's ArchiMate 3.2 specification defines the element and relationship types. [Specification C226](https://publications.opengroup.org/standards/archimate/c226)
- The Open Group's reference cards illustrate element figures and relationship notation. [Reference cards N221](https://www.opengroup.org/sites/default/files/docs/downloads/n221p.pdf)
- The catalogue records the Archi 3.2 reference fills. The renderer defines its display palette separately. [Archi palette](https://www.archimatetool.com/downloads/colour-schemes/ArchiMate%20Standard%20-%203.2.prefs)
- Mermaid provides the external diagram API, and ELK lays out the diagram. [Mermaid diagram guide](https://mermaid.js.org/community/new-diagram.html) · [ELK](https://eclipse.dev/elk/)

The plugin code is licensed under the [MIT License](LICENSE). The ArchiMate specification has [separate licensing terms](https://www.opengroup.co.za/standards). ArchiMate® is a registered trademark of The Open Group.
