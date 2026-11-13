---
name: archimate-mermaid
description: Author, validate, and render ArchiMate 3.2 diagrams in the archimate-beta syntax for the archimate-mermaid plugin. Use for .mmd diagrams with typed elements, relationships, nesting, and notes.
---

# ArchiMate for Mermaid

Start the source with `archimate-beta`. Put one declaration on each line. Use the exact type keys exported by `archimate-mermaid/language` in `elementTypes` and `relationshipTypes`. Give elements, relationships, and notes unique IDs. IDs start with a letter or underscore and can contain letters, digits, underscores, and hyphens. Quote display names, descriptions, labels, and note text with JSON-compatible double quotes. Names, labels, and note text must not be empty. Use `\n` for a line break. Long names and labels wrap automatically. Use `accDescr { … }` for a multi-line accessible description. A leading YAML frontmatter block between `---` lines is allowed.

```text
archimate-beta
  direction LR
  accTitle: Order management
  accDescr: The order management suite contains a billing component.

  element applicationComponent suite "Order management suite"
  element applicationComponent billing "Billing"
  description billing "Handles invoicing."

  relationship composition includes_billing suite -> billing
  nest billing in suite via includes_billing
  note review "Confirm retry behaviour" on suite
```

## Layout

- Omit `layout` and `direction` to use architecture layout by default, or select it explicitly with `layout architecture`. Occupied rows follow Strategy, Business, Application, Technology (including Physical), and Implementation & Migration. Relationships guide the placement of connected elements within and across layers. Motivation sits at the top, near the chains it connects to.
- Use `layout framework` for the same layer order with fixed Passive Structure, Behavior, and Active Structure columns from left to right and Motivation on the far right. Only occupied rows and columns take up space.
- Architecture and framework layouts preserve nesting. A parent with its own layer determines its container's placement. Groups without their own layer that contain elements from multiple layers are placed separately.
- Use `layout graph` for relationship-driven placement. Graph layout accepts `direction TB`, `BT`, `LR`, or `RL` and defaults to `TB`. A `direction` declaration on its own selects graph layout. An explicit `layout` declaration takes precedence.

## Model relationships and annotations

- Use `relationship <type> <id> <source> -> <target>`. The arrow in the source declares model direction. For Access, put the accessor first and choose `access read`, `access write`, `access readWrite`, or `access unspecified` after the target. Use `directed` after the target to draw a directed Association. Add `label "Text"` last.
- Or use the shorthand `<source> <connector> <target>` with an optional `: "Text"` label: `*--` composition, `o--` aggregation, `@==>` assignment, `..|>` realization, `-->` serving, `..` / `<..` / `..>` / `<..>` access (unspecified, read, write, readWrite), `-.->` influence, `---` / `--/` association (undirected, directed), `==>` triggering, `-.=>` flow, `--|>` specialization. The left endpoint is always the model source; `manage <.. order` means manage reads order. Shorthand relationships get generated IDs, so use the long form when a declaration must reference the ID. An ID that starts a statement is never read as the `o--` glyph, so write `o o-- b`, not `o--b`. Do not repeat an identical shorthand line; the validator warns about it.
- For `nest <child> in <parent> via <relationship-id>`, declare the relationship separately. Omit `via <relationship-id>` when exactly one relationship between the pair supports nesting. Composition, aggregation, assignment, realization, and access point from parent to child. Specialization points from child to parent. Each child has at most one visual parent, and nesting must be acyclic.
- Use `note <id> "Text"` for a standalone annotation or append `on <element-id>` to attach it above a declared element (below it in `direction BT`). Notes can be either endpoint of any supported relationship type. Keep architectural meaning in the ArchiMate elements and their relationships.
- The renderer uses the default notation for 60 element types and 11 relationship types. The current feature boundary covers direct endpoints, nested elements, and notes. Junctions, relationships used as endpoints, alternate notation, viewpoint tooling, and model exchange remain future work.

## Check and render

From the repository root, use Node.js 22.12 or later. If the checkout needs setup, run `npm ci` and `npm run build`. Validate with `node dist/cli.js validate diagram.mmd` or, with the package installed, `archimate validate diagram.mmd`. Pass `-` as the input file to validate stdin. The validator prints every problem as `file:line:column: message` and prefixes warnings with `warning:`. It exits with status 1 if there is any error and 0 if there are only warnings. Fix reported errors against the model, then validate again. Programmatic callers can use `parseArchiMate(source)` from `archimate-mermaid/language`, or `validateArchiMate(source)` to get every error and warning at once.

Validation covers syntax, declared endpoints, supported element and relationship types, relationship options, and nesting. Verify that ArchiMate 3.2 permits each relationship between its source and target element types. Automatic checks against Appendix B are under development. See the [release status in the README](../../README.md).

For SVG rendering from the checkout, install Playwright Chromium with `npx playwright install chromium` if needed, then run `npm run render -- diagram.mmd diagram.svg`. Inspect layout and labels before sharing the SVG. For browser integration, use the Mermaid peer version in `package.json` and call `await mermaid.registerExternalDiagrams([archimate])` with `archimate` imported from `archimate-mermaid` before rendering. Use the exported SVG in Markdown hosts without custom diagram registration.

- [Order management](../../examples/order-management.mmd) models assignment, realization, serving, and read access.
- Cross-layer relationships shows architecture layout and nested claims processing. [Source](../../examples/cross-layer-relationships.mmd) · [SVG](../../examples/cross-layer-relationships.svg)
- [Nested components](../../examples/nested-components.mmd) shows composition, attached and standalone notes, and cross-boundary connections.
- [Notation preview](../../examples/element-preview.svg) shows the supported symbols and line styles.
