---
name: archimate-mermaid
description: Author, validate, and render ArchiMate 3.2 diagrams in the archimate-beta syntax for the archimate-for-mermaid plugin. Use for .mmd diagrams with typed elements, relationships, nesting, and notes.
---

# ArchiMate for Mermaid

Start the source with `archimate-beta`. Put one declaration on each line. Use the exact type keys exported by `archimate-for-mermaid/language` in `elementTypes` and `relationshipTypes`. Give elements, relationships, and notes unique IDs. IDs start with a letter or underscore and can contain letters, digits, underscores, and hyphens. Quote display names, descriptions, labels, and note text with JSON-compatible double quotes. Use `\n` for a line break. Set `direction` to `TB`, `BT`, `LR`, or `RL`. The default is `TB`.

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

## Model relationships and annotations

- Use `relationship <type> <id> <source> -> <target>`. The arrow in the source declares model direction. For Access, put the accessor first and choose `access read`, `access write`, `access readWrite`, or `access unspecified` after the target. Use `directed` after the target to draw a directed Association. Add `label "Text"` last.
- For `nest <child> in <parent> via <relationship-id>`, declare the relationship separately. Composition, aggregation, assignment, realization, and access point from parent to child. Specialization points from child to parent. Each child has at most one visual parent, and nesting must be acyclic.
- Use `note <id> "Text"` for a standalone annotation or append `on <element-id>` to attach it above a declared element. Notes can be either endpoint of any supported relationship type. Keep architectural meaning in the ArchiMate elements and their relationships.
- The renderer uses the default notation for 60 element types and 11 relationship types. The current feature boundary covers direct endpoints, nested elements, and notes. Junctions, relationships used as endpoints, alternate notation, viewpoint tooling, and model exchange remain future work.

## Check and render

From the repository root, use Node.js 22.12 or later. If the checkout needs setup, run `npm ci` and `npm run build`. Validate with `node dist/cli.js validate diagram.mmd` or, with the package installed, `archimate validate diagram.mmd`. Pass `-` as the input file to validate stdin. Fix reported line and column errors against the model, then validate again. Programmatic callers can use `parseArchiMate(source)` from `archimate-for-mermaid/language`.

Validation covers syntax, declared endpoints, supported element and relationship types, relationship options, and nesting. Verify that ArchiMate 3.2 permits each relationship between its source and target element types. Automatic checks against Appendix B are under development. See the [release status in the README](../../README.md).

For SVG rendering from the checkout, install Playwright Chromium with `npx playwright install chromium` if needed, then run `npm run render -- diagram.mmd diagram.svg`. Inspect layout and labels before sharing the SVG. For browser integration, use the Mermaid peer version in `package.json` and call `await mermaid.registerExternalDiagrams([archimate])` with `archimate` imported from `archimate-for-mermaid` before rendering. Use the exported SVG in Markdown hosts without custom diagram registration.

- [Order management](../../examples/order-management.mmd) models assignment, realization, serving, and read access.
- [Nested components](../../examples/nested-components.mmd) shows composition, attached and standalone notes, and cross-boundary connections.
- [Notation preview](../../examples/element-preview.svg) shows the supported symbols and line styles.
