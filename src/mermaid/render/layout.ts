import type { ELK, ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { ArchiMateModel } from '../../archimate/model.js';
import {
  placeArchitecture,
  type Arrangement,
  type LayoutRelationship,
  type MeasuredNode,
  type Placement,
} from '../architectureLayout.js';
import { placeCustom } from '../customLayout.js';
import type { LayoutGraph } from './graph.js';
import { layoutPadding, usesArchitectureLayout } from './shared.js';

const architectureRows = ['strategy', 'business', 'application', 'technology', 'implementationAndMigration'];
type ElkConstructor = new () => ELK;

function isElkConstructor(value: unknown): value is ElkConstructor {
  return typeof value === 'function';
}

function property(value: unknown, name: string): unknown {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
    ? Reflect.get(value, name)
    : undefined;
}

// ELK ships a CommonJS bundle that marks itself as an ES module. Depending on the bundler, the default
// import is the constructor itself or module.exports with the constructor on its default property.
export function resolveElkConstructor(loaded: unknown): ElkConstructor {
  const constructor = [loaded, property(loaded, 'default'), property(property(loaded, 'default'), 'default')].find(
    isElkConstructor,
  );
  if (!constructor) {
    throw new Error('The elkjs module did not provide its layout constructor.');
  }
  return constructor;
}

let elkInstance: Promise<ELK> | undefined;

// Only graph layout needs ELK, so the 1.5 MB bundle loads on first use.
function loadElk(): Promise<ELK> {
  elkInstance ??= import('elkjs/lib/elk.bundled.js')
    .then((loaded) => new (resolveElkConstructor(loaded))())
    .catch((error: unknown) => {
      elkInstance = undefined;
      throw error;
    });
  return elkInstance;
}

export interface DiagramLayout {
  readonly root: ElkNode;
  readonly width: number;
  readonly height: number;
}

interface ArchitectureInputs {
  readonly placements: Map<string, Placement>;
  readonly relationships: LayoutRelationship[];
  readonly labelHeight: number;
}

function architectureInputs({ input, nodes, edges }: LayoutGraph): ArchitectureInputs {
  return {
    placements: new Map(
      Array.from(nodes, ([key, { type, headerHeight, notesHeight }]) => [
        key,
        {
          row: type.category === 'composite' ? null : type.category === 'physical' ? 'technology' : type.category,
          column: type.aspect === 'motivation' ? null : type.aspect,
          headerHeight: headerHeight + notesHeight,
        },
      ]),
    ),
    relationships: input.edges.flatMap(({ id: edgeId, sources: [source], targets: [target] }) => {
      const type = edges.get(edgeId)?.relationship.type;
      return source && target && type ? [{ source, target, type }] : [];
    }),
    labelHeight: Array.from(edges.values()).reduce((height, edge) => Math.max(height, edge.label?.height ?? 0), 0),
  };
}

function subtreeIds(nodes: readonly MeasuredNode[]): Set<string> {
  const ids = new Set<string>();
  const visit = (node: MeasuredNode) => {
    ids.add(node.id);
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return ids;
}

function placeCustomDiagram(model: ArchiMateModel, graph: LayoutGraph, maxRowWidth: number): Arrangement {
  const { placements, relationships, labelHeight } = architectureInputs(graph);
  const layoutIds = new Map<string, string>([
    ...Array.from(graph.nodes, ([key, { element }]) => [element.id, key] as const),
    ...Array.from(graph.notes, ([key, { note }]) => [note.id, key] as const),
  ]);
  const positions = new Map(
    (model.positions ?? []).flatMap((position) => {
      const key = layoutIds.get(position.id);
      return key === undefined ? [] : [[key, position] as const];
    }),
  );
  return placeCustom(graph.input.children, {
    positions,
    headerHeights: new Map(Array.from(placements, ([key, { headerHeight }]) => [key, headerHeight])),
    padding: layoutPadding,
    fallback: (nodes) => {
      const ids = subtreeIds(nodes);
      return placeArchitecture(
        nodes,
        placements,
        relationships.filter(({ source, target }) => ids.has(source) && ids.has(target)),
        { rowOrder: architectureRows, padding: layoutPadding, labelHeight, maxRowWidth },
      );
    },
  });
}

export async function layoutDiagram(
  model: ArchiMateModel,
  graph: LayoutGraph,
  maxRowWidth: number,
): Promise<DiagramLayout> {
  const { input } = graph;
  let root: ElkNode;
  if (model.layout === 'custom') {
    root = { ...input, ...placeCustomDiagram(model, graph, maxRowWidth) };
  } else if (usesArchitectureLayout(model)) {
    const { placements, relationships, labelHeight } = architectureInputs(graph);
    root = {
      ...input,
      ...placeArchitecture(input.children, placements, relationships, {
        rowOrder: architectureRows,
        padding: layoutPadding,
        labelHeight,
        framework: model.layout === 'framework',
        maxRowWidth,
      }),
    };
  } else {
    root = await (await loadElk()).layout(input);
  }
  if (root.width === undefined || root.height === undefined) {
    throw new Error('ELK did not return the ArchiMate diagram size.');
  }
  return { root, width: root.width, height: root.height };
}
