# ArchiMate 3.2 for Mermaid

This design defines a Mermaid diagram type for authoring ArchiMate 3.2 in plain text. People and AI models can write the same syntax, validate it before publishing, and review changes in Git. Each source block defines one diagram and can also live in its own file. Shared models, model exchange and viewpoint tooling can follow once that workflow is established.

This document records the design and the route toward Mermaid upstream integration. The [README](README.md) describes what version 0.1.0 implements and how to use it.

## Sources

| Decision | Reference |
| --- | --- |
| Element taxonomy and relationship semantics | The [ArchiMate® 3.2 Specification (C226)](https://publications.opengroup.org/standards/archimate/c226), Chapters 3–12 |
| Default and alternative figures, line patterns and endpoint markers | Appendix A of the 3.2 specification and the relevant concept definitions, with the [ArchiMate® 3.2 Reference Cards (N221)](https://www.opengroup.org/sites/default/files/docs/downloads/n221p.pdf) as the visual checklist |
| Catalogue reference fills | The [ArchiMate Standard 3.2 palette](https://www.archimatetool.com/downloads/colour-schemes/ArchiMate%20Standard%20-%203.2.prefs), keyed by element type |

Cite the source section for each catalogue entry. Write short original descriptions and examples for authors. The renderer defines its own layer fills, outlines and text colours. Section 3.9 of the 3.2 specification leaves colour to the modeller, so the validator uses concept types and properties.

## Mermaid integration

Use the [Use Case diagram](https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid/src/diagrams/usecase) as the structural reference and the [new diagram guide](https://mermaid.js.org/community/new-diagram.html) as the contribution checklist. Target Mermaid 12.3.0 for the first integration prototype. An external package can register a diagram using the same public entry point documented for ZenUML. [Mermaid 12.3.0 release](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.3.0) · [External diagram registration](https://mermaid.js.org/config/setup/mermaid/interfaces/Mermaid.html#registerexternaldiagrams) · [ZenUML](https://mermaid.js.org/syntax/zenuml.html)

| Mermaid component | ArchiMate responsibility |
| --- | --- |
| Detector and lazy loader | Recognise the complete diagram header and load the diagram on demand. Register through `mermaid.registerExternalDiagrams()`. |
| Parser | Use a Chevrotain lexer, grammar and visitor. Return declarations and their source locations so diagnostics point to the offending statement. |
| Diagram database (`db`) | Hold the current model and diagram metadata. Reset state between parses, including after failures. The parser and renderer must agree on the state instance Mermaid supplies. |
| Renderer | Project the validated model into nodes, edges and labels. Lay out the graph, draw ArchiMate SVG notation, and apply padding, responsive sizing and accessible names. |
| Styles | Resolve colours through named palette entries and use Mermaid theme settings for compatible presentation choices such as font and canvas. Test legibility with the default palette in light and dark hosts. |

The Mermaid adapter owns registration, the parser/DB contract and SVG host integration. The catalogue, grammar and validation can also run without a browser. This keeps the authoring workflow portable while Mermaid explores its v13 renderer. [Mermaid v13 alpha](https://mermaid.js.org/intro/v13-alpha.html)

The Use Case renderer projects its model into layout data and calls Mermaid's shared rendering utilities from inside the repository. Prototype that same division of responsibilities through the public registration API. Test an ELK layout with ArchiMate markers and compound groups, and verify which published interfaces can support it. If the required utilities are internal, call the layout engine through the plugin's renderer. [Use Case renderer](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/diagrams/usecase/usecaseRenderer.ts) · [Mermaid layout documentation](https://mermaid.js.org/intro/syntax-reference.html#layout-and-look)

## Repository layout

```text
src/
  language.ts           # Public parse and validate API, usable without a browser
  cli.ts                # archimate validate
  archimate/
    catalogue.ts        # 3.2 element and relationship types and notation
    model.ts            # Elements, relationships, notes and diagram options
    lexer.ts            # Tokens, including shorthand connectors
    grammar.ts          # Chevrotain grammar
    frontmatter.ts      # Leading YAML block and byte order mark
    parser.ts           # parseArchiMate, the throwing entry point
    validate.ts         # Model construction, semantic checks and validateArchiMate
    nesting.ts          # Nesting rules
    diagnostics.ts      # Diagnostic codes, severities and ranges
    suggestions.ts      # "Did you mean" hints
  mermaid/
    archimateDetector.ts
    archimateDiagram.ts # Parser, DB, renderer and styles registration
    archimateRenderer.ts # Pipeline over the render phases
    render/             # measure, graph, layout, place, route, labels, viewport, draw
    architectureLayout.ts
    relationshipPlacement.ts
    orthogonalRouter.ts # Orthogonal routing for architecture and framework layout
    routing/            # Anchors, bundle planning, congestion and path search
    styles.ts
examples/               # Authoring examples and visual fixtures
test/                   # Language, CLI, layout and browser tests
```

The diagram database is defined inline in `archimateDiagram.ts`; there is no separate `archimateDb.ts`.

Start with one TypeScript package. Keep module boundaries clear enough that the diagram can later fit under Mermaid's own `diagrams/archimate/` directory. Choose a separate CLI package only if its dependencies or distribution needs warrant it.

## Model and authoring

An element has a stable ID, a 3.2 type, a displayed name and an optional description. A relationship has its own ID, source, target, type and type-specific properties such as Access mode or Influence strength. A junction has its own identity and AND/OR kind. Store layout direction, the choice of permitted figure, and graphical nesting as presentation data. A nested rendering of a semantic relationship must have an explicit, validated meaning.

Keep model endpoints separate from SVG marker placement. For example, Access mode can change which end shows an arrow. The model still identifies the accessing concept and the accessed concept explicitly.

The following is a syntax proposal. The type names are recognisable, the IDs are stable across renames, and the relationship direction is visible in a Git diff. Section 8.2.2 of the 3.2 specification permits assigning a Business Role to a Business Process.

```text
archimate-beta
  direction LR
  accTitle: Order fulfilment responsibilities

  element businessRole clerk "Fulfilment clerk"
  element businessProcess fulfil "Fulfil order"
  description fulfil "Pick, pack and dispatch a paid order."

  relationship assignment clerk_to_fulfil clerk -> fulfil
```

The parser should accept forward references and resolve them after parsing. Use one documented spelling per construct, quoted plain text, and one statement per line. Show the element name by default and retain the description for accessible details. Publish a compact syntax and type reference from the same catalogue used for validation, with examples AI models can use and CI can check.

## Validation and rendering

1. Parse the document and report syntax errors with line and column. Resolve IDs and report duplicates and unknown element or relationship types.
2. Check that relationship endpoints refer to declared elements or notes. For nesting, check the referenced relationship's type and direction, enforce one parent per child, and reject cycles.
3. Validate relationship options such as Access mode and directed Association. Report unsupported features explicitly during incremental development.
4. Lay out the validated model. The renderer selects the ArchiMate shape, icon, line pattern and markers from the concept's notation. Snapshot representative diagrams to check that markers land at the correct end, routes and labels remain readable, and the chosen palette is preserved.

Authors use Appendix B of the 3.2 specification to verify which element types a relationship can connect. Automatic checks against Appendix B are under development, and their release depends on permission from The Open Group to distribute the relationship lookup.

CI should validate the text and render SVG with pinned versions and fonts. The same examples should exercise standalone validation and a real Mermaid host. Repositories can publish the SVG anywhere that accepts image assets, and hosts that load the plugin can render the source directly.

## First integration milestone

1. Prepare the 3.2 catalogue structure and trace a small verified set of entries to the 3.2 specification, the reference cards and the Archi palette. Include a business role and process, an application element, a composite or connector, and relationships with distinct endpoint markers.
2. Prove that the proposed syntax works through the external diagram API on the pinned Mermaid release. Render two diagrams on one page, render again after invalid input, and test accessible metadata and source positions with Mermaid front matter and comments.
3. Verify layout and notation on a cross-layer view and a nested view. Check Access marker placement and rejection of a relationship with the wrong direction for its nesting declaration.
4. Expand the catalogue and validation coverage and document the supported subset for a public beta. Add the CLI publishing path, executable documentation examples and realistic visual fixtures.

For possible upstream inclusion, bring the working package and examples to the [existing ArchiMate discussion](https://github.com/orgs/mermaid-js/discussions/4007). Agree on syntax, scope, theme defaults and the renderer integration before preparing a contribution. Mermaid's in-tree checklist covers registration, schema changes for configuration, documentation, examples, demos, tests and a changeset. The palette and layout approach are the two integration decisions to settle early. [Mermaid contribution guide](https://mermaid.js.org/community/new-diagram.html)

## Trademark

Archimaid is an independent project and is not affiliated with or endorsed by The Open Group. ArchiMate is a registered trademark of The Open Group in the United States and other countries.
