# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses [semantic versioning](https://semver.org/). While the version is 0.x and the header is `archimate-beta`, minor releases may change the syntax.

## 0.2.0

### Language

- `layout custom` with a `positions { … }` block pins elements and standalone notes to a 20-pixel grid with `id at x y` and an optional minimum `size WxH`. Nested elements are positioned relative to their parent.
- `source connector target from T to B` or `relationshipId from T to B` in the block chooses the sides where a relationship leaves its source and enters its target.
- New warnings for positions that refer to undeclared IDs, are ignored, are missing in custom layout, or sit closer than 2 grid units to a neighbour. New error code `INVALID_POSITION`.
- `ArchiMateModel` gains optional `positions` and `anchors`, exported with the `ArchiMatePosition`, `ArchiMateAnchor` and `ArchiMateSide` types.

### Rendering

- Custom layout places pinned elements as written, routes relationships with the architecture router, and places elements without a position with architecture layout. Other layouts ignore the `positions` block.

### Examples

- The packaged examples write relationships in shorthand, and a custom layout example is added.

### Project

- [Archimaid Designer](https://design.archimaid.org) draws diagrams on a canvas: drag elements in, name and connect them, move and resize them, and it writes the `archimate-beta` text, with custom layout for the positions. It works on phones too.
- The agent skill explains how to read and edit the `positions` block: skip it when reading, keep it in step when renaming or removing elements, and leave line routing to the engine.

## 0.1.1

### Project

- The repository moved to the [Archimaid organisation](https://github.com/Archimaid/archimaid), and the npm homepage now links to [archimaid.org](https://archimaid.org).
- Releases are published from GitHub Actions through npm trusted publishing, with a provenance statement.

## 0.1.0

First release.

### Language

- The `archimate-beta` diagram type with all 60 ArchiMate 3.2 element types and 11 relationship types.
- Long-form relationships with IDs, a shorthand connector syntax, and standalone or attached notes.
- Nesting through element blocks or `nest`, backed by a relationship when one supports it and visual otherwise.
- `click` links elements to a URL with an optional tooltip and target. Hovering an element shows its description.
- `title`, `accTitle`, `accDescr` and `accDescr { … }` metadata, and a leading YAML frontmatter block.
- `parseArchiMate` and `validateArchiMate` in `archimaid/language`, which report every error and warning with source ranges and suggest the closest valid keyword for a misspelt type.

### Rendering

- Architecture, framework and graph layouts. Relationships of the same type at one element share an anchor and a trunk, wide rows wrap, and long names and labels wrap.
- Mermaid theme support, including `themeVariables` with `theme: 'base'`, and a `background` option for a transparent canvas.
- Accessible names for elements, notes and relationships.
- A prebuilt ES module bundle for pages without a bundler, exported as `archimaid/bundle`. ELK loads on demand for `layout graph` only.

### Command line

- `archimaid validate` for files, directories, standard input and Markdown code blocks, with text, JSON and GitHub Actions output.
- `archimaid render` to SVG through Playwright, with `--theme` and `--background`.

### Documentation

- A [type reference](docs/reference.md) generated from the catalogue, and an agent skill with the element table.
