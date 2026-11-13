import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk.bundled.js";
import {
  getRelationshipNotation,
  relationshipNames,
  relationshipTypes,
  type AccessMode,
  type RelationshipType,
} from "../../archimate/catalogue.js";
import type { ArchiMateModel } from "../../archimate/model.js";
import { ancestors } from "../hierarchy.js";
import type { MeasuredDiagram } from "./measure.js";
import {
  edgeLabelPadding, elkLayerSpacing, elkNodeSpacing, headerLabelPadding, iconLabelGap, iconRightInset, iconSize,
  layoutPadding, minimumElementWidth, minimumHeaderHeight, minimumNoteHeight, noteFold, noteInset, noteOverlap,
  notesBelowHost, plainLabelInset, usesArchitectureLayout,
  type EdgeAppearance, type MeasuredElkNode, type NodeAppearance, type NoteAppearance, type Relationship,
} from "./shared.js";

const layoutDirection = {
  TB: "DOWN",
  BT: "UP",
  LR: "RIGHT",
  RL: "LEFT",
} satisfies Record<ArchiMateModel["direction"], string>;

function isRelationshipType(type: string): type is RelationshipType {
  return (relationshipTypes as readonly string[]).includes(type);
}

const accessModeWords = {
  read: "read",
  write: "write",
  readWrite: "read and write",
  unspecified: undefined,
} satisfies Record<AccessMode, string | undefined>;

function relationshipDescription(relationship: Relationship, names: ReadonlyMap<string, string>): string {
  const typeName = isRelationshipType(relationship.type) ? relationshipNames[relationship.type] : relationship.type;
  const mode = relationship.type === "access" ? accessModeWords[relationship.access ?? "unspecified"] : undefined;
  const qualifier = mode ? ` (${mode})` : relationship.type === "association" && relationship.directed ? " (directed)" : "";
  const source = names.get(relationship.source) ?? relationship.source;
  const target = names.get(relationship.target) ?? relationship.target;
  const description = `${source} — ${typeName}${qualifier} → ${target}`;
  return relationship.label ? `${description}: ${relationship.label}` : description;
}

export interface LayoutGraph {
  readonly input: ElkNode & { children: MeasuredElkNode[]; edges: ElkExtendedEdge[] };
  // Keyed by layout node id.
  readonly nodes: ReadonlyMap<string, NodeAppearance>;
  readonly notes: ReadonlyMap<string, NoteAppearance>;
  // Attached notes, keyed by the id of the element they are attached to.
  readonly overlays: ReadonlyMap<string, readonly NoteAppearance[]>;
  // Keyed by layout edge id.
  readonly edges: ReadonlyMap<string, EdgeAppearance>;
  readonly overlayLaneCounts: ReadonlyMap<string, number>;
  // Layout node ids of elements nested in another element.
  readonly nested: ReadonlySet<string>;
}

interface LayoutNodes {
  readonly nodes: Map<string, NodeAppearance>;
  readonly notes: Map<string, NoteAppearance>;
  readonly overlays: Map<string, NoteAppearance[]>;
  // Layout node id by model id; an attached note shares its host's layout node.
  readonly nodeIds: Map<string, string>;
  readonly elkNodes: Map<string, MeasuredElkNode>;
  readonly children: MeasuredElkNode[];
}

function layoutNodes(measured: MeasuredDiagram, model: ArchiMateModel): LayoutNodes {
  const nodes = new Map<string, NodeAppearance>();
  const notes = new Map<string, NoteAppearance>();
  const overlays = new Map<string, NoteAppearance[]>();
  const nodeIds = new Map<string, string>();
  const children: MeasuredElkNode[] = [];
  for (const [index, note] of (model.notes ?? []).entries()) {
    const label = measured.notes[index];
    if (!label) throw new Error(`The note "${note.id}" was not measured.`);
    const appearance = {
      note, label,
      width: Math.max(minimumElementWidth, label.width + 2 * (noteInset + noteFold)),
      height: Math.max(minimumNoteHeight, label.height + 2 * noteInset),
    };
    if (note.on !== undefined) {
      const attached = overlays.get(note.on);
      if (attached) attached.push(appearance);
      else overlays.set(note.on, [appearance]);
    } else {
      const id = `note${index}`;
      nodeIds.set(note.id, id);
      notes.set(id, appearance);
      children.push({ id, width: appearance.width, height: appearance.height });
    }
  }

  const elkNodes = new Map<string, MeasuredElkNode>();
  for (const [index, { element, type, notation, label }] of measured.elements.entries()) {
    const internalId = `n${index}`;
    // Reserve the same space on both sides so centered labels clear the icon.
    const labelInset = notation.icon?.length
      ? iconRightInset(notation.outline) + iconSize + iconLabelGap
      : plainLabelInset;
    const attached = overlays.get(element.id) ?? [];
    const notesHeight = attached.length
      ? attached.reduce((height, note) => height + note.height, 0)
        + (attached.length - 1) * noteInset - noteOverlap
      : 0;
    const headerHeight = Math.max(minimumHeaderHeight, label.height + headerLabelPadding);
    const width = Math.max(minimumElementWidth, label.width + 2 * labelInset,
      ...attached.map(({ width }) => width + 2 * noteInset));
    nodes.set(internalId, { element, type, notation, label, headerHeight, notesHeight });
    nodeIds.set(element.id, internalId);
    elkNodes.set(element.id, { id: internalId, width, height: headerHeight + notesHeight });
    for (const { note } of attached) nodeIds.set(note.id, internalId);
  }
  return { nodes, notes, overlays, nodeIds, elkNodes, children };
}

// Moves members into their containers and returns the layout ids of the nested members.
function nestLayoutNodes(model: ArchiMateModel, { nodes, elkNodes, children }: LayoutNodes): Set<string> {
  const nested = new Set<string>();
  const notesBelow = notesBelowHost(model);
  for (const { parent, child } of model.nesting ?? []) {
    const container = elkNodes.get(parent);
    const member = elkNodes.get(child);
    const appearance = container && nodes.get(container.id);
    if (!container || !member || !appearance) {
      throw new Error(`Layout nodes for nesting "${child}" in "${parent}" are unavailable.`);
    }
    nested.add(member.id);
    if (!container.children) {
      container.children = [];
      const top = appearance.headerHeight + (notesBelow ? 0 : appearance.notesHeight);
      const bottom = layoutPadding + (notesBelow ? appearance.notesHeight : 0);
      // ELK Layered reads compound minimum sizes in its horizontal coordinate system.
      const vertical = model.direction === "TB" || model.direction === "BT";
      const minimumSize = vertical
        ? `(${container.height},${container.width})`
        : `(${container.width},${container.height})`;
      container.layoutOptions = {
        "elk.padding": `[top=${top},left=${layoutPadding},bottom=${bottom},right=${layoutPadding}]`,
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        "elk.nodeSize.minimum": minimumSize,
      };
    }
    container.children.push(member);
  }
  for (const node of elkNodes.values()) {
    if (!nested.has(node.id)) children.push(node);
  }
  return nested;
}

interface LayoutEdges {
  readonly edges: Map<string, EdgeAppearance>;
  readonly overlayLaneCounts: Map<string, number>;
  readonly relationships: ElkExtendedEdge[];
}

function layoutEdges(
  model: ArchiMateModel, measured: MeasuredDiagram, nodeIds: ReadonlyMap<string, string>,
  parents: ReadonlyMap<string, string>,
): LayoutEdges {
  const edges = new Map<string, EdgeAppearance>();
  const overlayLaneCounts = new Map<string, number>();
  const nestingRelationships = new Set(model.nesting?.map(({ relationship }) => relationship));
  const architecture = usesArchitectureLayout(model);
  const noteHosts = new Map((model.notes ?? []).map((note) => [note.id, note.on]));
  const relationships: ElkExtendedEdge[] = [];
  const encloses = (outer: string, inner: string | undefined): boolean =>
    ancestors(inner ?? "", parents).includes(outer);
  const nestedWithHost = (note: string, other: string): boolean => {
    const host = noteHosts.get(note);
    return host !== undefined && (encloses(other, host) || encloses(host, other));
  };
  const endpointNames = new Map([
    ...model.elements.map(({ id, name }) => [id, name] as const),
    ...(model.notes ?? []).map(({ id, text }) => [id, text] as const),
  ]);
  for (const [index, relationship] of model.relationships.entries()) {
    if (nestingRelationships.has(relationship.id) && !relationship.label
      && (relationship.access === undefined || relationship.access === "unspecified")) {
      continue;
    }
    const source = nodeIds.get(relationship.source);
    const target = nodeIds.get(relationship.target);
    const notation = getRelationshipNotation(relationship.type, relationship.access, relationship.directed);
    if (!source || !target || !notation) {
      throw new Error(`SVG notation or endpoints for relationship "${relationship.id}" are unavailable.`);
    }

    const internalId = `e${index}`;
    const label = measured.relationshipLabels.get(relationship.id);
    const appearance: EdgeAppearance = {
      relationship, notation, label, accessibleName: relationshipDescription(relationship, endpointNames),
    };
    // A route between an attached note and a container or member of its host would have to cross the host.
    const enclosed = !architecture && (nestedWithHost(relationship.source, relationship.target)
      || nestedWithHost(relationship.target, relationship.source));
    if ((source === target && relationship.source !== relationship.target) || enclosed) {
      const host = enclosed ? nodeIds.get(noteHosts.get(relationship.source) ?? noteHosts.get(relationship.target) ?? "")
        : source;
      if (host === undefined) {
        throw new Error(`The host of the attached note in relationship "${relationship.id}" is unavailable.`);
      }
      const lane = overlayLaneCounts.get(host) ?? 0;
      appearance.overlayLane = lane;
      appearance.overlayKey = host;
      overlayLaneCounts.set(host, lane + 1);
    }
    edges.set(internalId, appearance);
    relationships.push({
      id: internalId,
      sources: [source],
      targets: [target],
      ...(label ? { labels: [{ id: `l${index}`, width: label.width + edgeLabelPadding, height: label.height }] } : {}),
    });
  }
  return { edges, overlayLaneCounts, relationships };
}

export function buildLayoutGraph(
  model: ArchiMateModel, measured: MeasuredDiagram, parents: ReadonlyMap<string, string>,
): LayoutGraph {
  const placed = layoutNodes(measured, model);
  const { nodes, notes, overlays, nodeIds, children } = placed;
  const nested = nestLayoutNodes(model, placed);
  const { edges, overlayLaneCounts, relationships } = layoutEdges(model, measured, nodeIds, parents);
  const input = {
    id: "archimate",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": layoutDirection[model.direction],
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": `[top=${layoutPadding},left=${layoutPadding},bottom=${layoutPadding},right=${layoutPadding}]`,
      "elk.spacing.nodeNode": String(elkNodeSpacing),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(elkLayerSpacing),
      "elk.json.shapeCoords": "ROOT",
      "elk.json.edgeCoords": "ROOT",
      ...(nested.size > 0 ? { "elk.hierarchyHandling": "INCLUDE_CHILDREN" } : {}),
    },
    children,
    edges: relationships,
  };
  return { input, nodes, notes, overlays, edges, overlayLaneCounts, nested };
}
