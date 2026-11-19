# Proposal: custom layout with pinned positions

Status: **implemented** on the `custom-layout` branch. The answers recorded under [Decisions](#decisions) are agreed. This proposal is a prerequisite for Archimaid Designer at design.archimaid.org.

## Goal

Every `archimate-beta` diagram is placed by the engine today: architecture, framework or graph layout. Architects often follow their own modelling conventions, such as a fixed left-to-right value stream or a house style for application landscapes, and the automatic layouts cannot reproduce them.

This proposal adds a fourth layout, `custom`, in which the author pins elements to positions and may choose the side where a relationship leaves or enters an element. The engine still routes every line.

Three readers must keep working:

- **People** read the model without wading through coordinates.
- **AI agents** can ignore the layout entirely, or use it, and an agent that ignores it must not break the diagram.
- **The renderer** uses the positions in custom layout and ignores them in every other layout.

## Non-goals

- Bend points or hand-drawn line paths. The engine routes lines; the author only chooses sides.
- Relative placement such as `fulfil right of clerk`. Positions are absolute only.
- Fitting unpositioned elements into the gaps between pinned ones. See [Partial positions](#partial-positions).
- Standard Mermaid syntax. Positions are an Archimaid extension of `archimate-beta`; Mermaid itself only offers side anchors in `architecture-beta`.
- Layout for Archimaid Studio views. Views in [proposal-model-and-views.md](proposal-model-and-views.md) can adopt this block later without changes.

## Syntax

A diagram switches to custom layout with `layout custom` and describes the layout in one `positions` block, conventionally at the end of the file.

```text
archimate-beta
  layout custom

  element businessRole clerk "Fulfilment clerk"
  element businessProcess fulfil "Fulfil order"
  element applicationService orders "Order service"
  element applicationComponent oms "Order management" {
    element applicationComponent billing "Billing"
  }
  clerk @==> fulfil
  orders --> fulfil
  oms ..|> orders

  positions {
    clerk at 0 0
    fulfil at 10 0 size 9x3
    orders at 10 8
    oms at 8 14
    billing at 1 3
    orders --> fulfil from T to B
  }
```

Everything above `positions` is the model. Everything inside it is geometry, so a reader or an agent can skip the block as a whole.

### Element positions

```text
<id> at <x> <y> [size <width>x<height>]
```

- `<id>` is an element or a note.
- `x` and `y` are whole grid units of 20 pixels, measured from the top-left corner of the diagram to the top-left corner of the element. They are 0 or greater.
- For a nested element, `x` and `y` are relative to the content area of its parent, so moving a parent moves its children without editing them.
- `size` is optional. Without it an element gets the size the renderer measures today, rounded up to whole grid units; the smallest element, 124 by 54 pixels, becomes `7x3`. With it, the size is a minimum: the renderer never clips a name and makes the element taller if the name does not fit.
- A parent always grows to enclose its children plus its padding, with or without `size`.
- Elements that are not nested keep a **minimum gap of 2 grid units** (40 pixels) between them, close to the 46-pixel gap of architecture layout. It leaves the router room for a lead, a marker and its clearance on each side. The renderer honours a closer position as written and the validator warns; Designer snaps to the gap while dragging, so it never writes one.

### Relationship anchors

```text
<relationship> [from <side>] [to <side>]
```

- `<relationship>` is either the connector form, `orders --> fulfil`, or a relationship ID, such as a long-form ID or a generated `orders__serving__fulfil`.
- `<side>` is `T`, `R`, `B` or `L`, the letters Mermaid uses in `architecture-beta`. `from` is the side of the source, `to` the side of the target. Either may be left out; the router then chooses that side.
- Use the relationship ID when the connector form matches more than one relationship.
- An anchored relationship is not bundled, because a shared trunk chooses its own side. Relationships without anchors bundle as they do in architecture layout.
- If the router cannot offer the requested side, for example the top of an element seen from inside its container, it chooses a side itself.

### Layout switching

| Diagram declares | Renderer |
| --- | --- |
| `layout custom` and a `positions` block | Uses the positions and anchors |
| `layout custom` without a `positions` block | Places every element with architecture layout, with one warning for the missing block |
| Another layout, or none, and a `positions` block | Ignores the block; still validates it |

Switching between automatic and custom layout is therefore a one-line change, and the positions survive it. Designer relies on this for its auto/custom toggle.

## Partial positions

The existing layout algorithm is the fallback for elements without a position. The renderer works in two passes:

1. It places every positioned element exactly where the `positions` block says.
2. It runs architecture layout (`placeArchitecture`) on the unpositioned elements and the relationships between them, and places the result below the positioned content, separated by the 72-pixel cell gap of architecture layout.

The validator warns once per element: `oms has no position; placed by architecture layout`. This lets an agent add an element without inventing coordinates, and Designer can show such elements as "unplaced" for the user to drag into position.

Nesting follows the same rule:

- An unpositioned child of a positioned parent is placed inside the parent, below its positioned children.
- An unpositioned parent is placed by the fallback with its whole subtree. Positions of its children are ignored, with a warning.

The second pass reuses `placeArchitecture` unchanged on a subset of the model, which keeps it cheap to build. Placing unpositioned elements in the gaps between pinned ones would need a new algorithm and would make pinned diagrams depend on the engine version, so it is out of scope.

## Validation

| Problem | Severity | Reason |
| --- | --- | --- |
| Position or anchor for an unknown ID | Warning, ignored | An agent that ignores the block and deletes an element must not break the diagram. Diagnostics have no lower severity than a warning; adding a notice level is a separate change. |
| Two positions for the same element, or two anchor lines for the same relationship | Error | Only hand editing produces it, and there is no right answer |
| A connector form that matches several relationships | Error | Name the relationship by its ID |
| Elements that are not nested and overlap or sit closer than the minimum gap | Warning | Usually a mistake, occasionally deliberate; lines may route poorly |
| Element without a position in custom layout | Warning, placed by the fallback | See [Partial positions](#partial-positions) |
| Position of a child whose parent has no position | Warning, ignored | The fallback places the whole subtree |

The block is validated in every layout, so it does not rot while a diagram uses automatic layout.

## Guidance for AI agents

`skills/` and the README get a short rule set:

- When reading a diagram, skip the `positions` block.
- When adding an element, a position is optional.
- When removing or renaming an element, also remove or rename its lines in `positions`. Leaving them only produces a warning.
- Never invent anchors to fix a rendering; leave line routing to the engine.

## Model and API

`ArchiMateModel` gains two optional arrays, which stay plain data like the rest of the model. The renderer is the only consumer.

```ts
export type ArchiMateSide = 'T' | 'R' | 'B' | 'L';

export interface ArchiMatePosition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

export interface ArchiMateAnchor {
  readonly relationship: string;
  readonly source?: ArchiMateSide;
  readonly target?: ArchiMateSide;
}

// ArchiMateModel
readonly layout?: 'architecture' | 'framework' | 'graph' | 'custom';
readonly positions?: readonly ArchiMatePosition[];
readonly anchors?: readonly ArchiMateAnchor[];
```

Relationship anchors are keyed by the resolved relationship ID, so the renderer never has to match connector forms.

## Renderer

Custom layout replaces only placement. It converts positions to pixels, resolves nested coordinates against their parents, places unpositioned elements with the [fallback](#partial-positions), and hands the boxes to the existing orthogonal router (`src/mermaid/routing/`) with the requested sides as constraints. Labels, bundling, markers and styles stay unchanged. ELK is not loaded.

## Grammar notes

- Two new tokens: an integer, and a size such as `9x3`, matched before the integer.
- New keywords `positions`, `at`, `size`, `from` and `to`. Like the existing keywords they also lex as identifiers, so they stay valid as element IDs.
- `positions { … }` uses the same brace block as element blocks. It is allowed once, at the top level only.
- Inside the block a line starts with an identifier and continues with `at` (element), a connector (relationship by endpoints), or `from` or `to` (relationship by ID), which keeps the grammar LL(2).
- `custom` joins the accepted values of `layout`.
- Every declaration in the block carries a source range, so Designer can rewrite the one line a drag changes.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Inline positions, `element businessRole clerk "Clerk" at 0 0` | Mixes geometry into the model lines; every move changes the declaration line in diffs, and agents cannot skip layout as a block |
| A sidecar JSON file | Breaks the one-text-block rule that Mermaid hosts depend on, and share links would need two documents |
| Graphviz `pos="x,y!"` with `tailport`/`headport` | The right concepts, which this proposal borrows (partial pinning, ports), but noisy attribute syntax and point units |
| Pikchr relative placement | Readable, but the author draws every line, drags cannot be written back reliably, and two ways to place an element make the language bigger |
| Pixel coordinates | Noisy numbers that break when fonts or themes change sizes; a 20-pixel grid converts to and from pixels exactly |

## Adoption path

1. Approve this syntax.
2. Parser, model and validation, with source ranges on all declarations.
3. Custom placement in the renderer, using the existing router.
4. Reference docs, an example, and the agent guidance.
5. Designer writes and edits the block; the playground highlights it.
6. Later, F-07 model exchange can map ArchiMate view bounds to and from positions by rounding to the grid.

## Decisions

1. The layout is called `custom`.
2. Relative placement is not added. Positions are absolute only.
3. A position or anchor for an unknown ID is a warning and is ignored, never an error.
4. Elements without a position are placed by the existing architecture layout as a fallback, after the positioned elements, with a warning per element.

5. Coordinates use a 20-pixel grid with a minimum gap of 2 units between elements that are not nested. The validator checks the gap against the smallest size each element can have, because element sizes depend on text measurement.

## Open questions

1. **Spacing with labels.** Is 2 units enough when a relationship label sits between two elements, or should the gap grow with the label, as architecture layout does?
