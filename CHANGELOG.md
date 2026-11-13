# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses [semantic versioning](https://semver.org/). While the version is 0.x and the header is `archimate-beta`, minor releases may change the syntax.

## 0.1.0

First release.

### Language

- The `archimate-beta` diagram type with all 60 ArchiMate 3.2 element types and 11 relationship types.
- Long-form relationships with IDs, a shorthand connector syntax, and standalone or attached notes.
- Nesting through element blocks or `nest`, backed by a relationship when one supports it and visual otherwise.
- `title`, `accTitle`, `accDescr` and `accDescr { … }` metadata, and a leading YAML frontmatter block.
- `parseArchiMate` and `validateArchiMate` in `archimate-mermaid/language`, which report every error and warning with source ranges and suggest the closest valid keyword for a misspelt type.

### Rendering

- Architecture, framework and graph layouts. Relationships of the same type at one element share an anchor and a trunk, wide rows wrap, and long names and labels wrap.
- Mermaid theme support, including `themeVariables` with `theme: 'base'`, and a `background` option for a transparent canvas.
- Accessible names for elements, notes and relationships.
- A prebuilt ES module bundle for pages without a bundler, exported as `archimate-mermaid/bundle`. ELK loads on demand for `layout graph` only.

### Command line

- `archimate validate` for files, directories, standard input and Markdown code blocks, with text, JSON and GitHub Actions output.
- `archimate render` to SVG through Playwright, with `--theme` and `--background`.

### Documentation

- A [type reference](docs/reference.md) generated from the catalogue, and an agent skill with the element table.
