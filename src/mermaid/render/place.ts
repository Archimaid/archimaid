import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { ArchiMateModel } from '../../archimate/model.js';
import type { LayoutGraph } from './graph.js';
import {
  compoundLabelInset,
  iconInset,
  iconRightInset,
  iconSize,
  noteInset,
  noteOverlap,
  notesBelowHost,
  positioned,
  type EdgeEndpoint,
  type NodeAppearance,
  type NoteAppearance,
  type PositionedNode,
} from './shared.js';

export interface PlacedElement {
  readonly appearance: NodeAppearance;
  readonly box: PositionedNode;
  readonly compound: boolean;
}

export interface PlacedNote {
  readonly appearance: NoteAppearance;
  readonly box: PositionedNode;
}

export interface Placement {
  // In drawing order: containers before their members.
  readonly elements: readonly PlacedElement[];
  readonly notes: readonly PlacedNote[];
  // Visible outlines by model id, for elements and for notes.
  readonly endpoints: ReadonlyMap<string, EdgeEndpoint>;
  // Compound titles and icons, by element id, that relationships must not cross.
  readonly decorations: ReadonlyMap<string, readonly PositionedNode[]>;
}

export function placeDiagram(model: ArchiMateModel, root: ElkNode, graph: LayoutGraph): Placement {
  const notesBelow = notesBelowHost(model);
  const placedNodes: PlacedElement[] = [];
  const placedNotes: PlacedNote[] = [];
  const nodeBoxes = new Map<string, EdgeEndpoint>();
  function placeNodes(children: readonly ElkNode[]): void {
    for (const node of children) {
      const layoutBox = positioned(node);
      const note = graph.notes.get(node.id);
      if (note) {
        placedNotes.push({ appearance: note, box: layoutBox });
        nodeBoxes.set(note.note.id, { box: layoutBox, outline: 'note' });
        continue;
      }
      const appearance = graph.nodes.get(node.id);
      if (!appearance) {
        throw new Error('ELK returned an unknown ArchiMate element.');
      }
      const box = {
        ...layoutBox,
        y: layoutBox.y + (notesBelow ? 0 : appearance.notesHeight),
        height: layoutBox.height - appearance.notesHeight,
      };
      placedNodes.push({ appearance, box, compound: Boolean(node.children?.length) });
      nodeBoxes.set(appearance.element.id, { box, outline: appearance.notation.outline });
      let y = notesBelow ? box.y + box.height - noteOverlap : layoutBox.y;
      for (const attached of graph.overlays.get(appearance.element.id) ?? []) {
        const position = {
          x: box.x + box.width - attached.width - noteInset,
          y,
          width: attached.width,
          height: attached.height,
        };
        placedNotes.push({ appearance: attached, box: position });
        nodeBoxes.set(attached.note.id, { box: position, outline: 'note', overlayHost: box });
        y += attached.height + noteInset;
      }
      if (node.children) placeNodes(node.children);
    }
  }
  placeNodes(root.children ?? []);
  const decorations = new Map(
    placedNodes
      .filter(({ compound }) => compound)
      .map(({ appearance: { element, label, notation }, box }) => {
        const titleBox = {
          x: box.x + (box.width - label.width) / 2,
          y: box.y + compoundLabelInset,
          width: label.width,
          height: label.height,
        };
        const iconBox = {
          x: box.x + box.width - iconRightInset(notation.outline) - iconSize,
          y: box.y + iconInset,
          width: iconSize,
          height: iconSize,
        };
        return [element.id, notation.icon?.length ? [titleBox, iconBox] : [titleBox]] as const;
      }),
  );
  return { elements: placedNodes, notes: placedNotes, endpoints: nodeBoxes, decorations };
}
