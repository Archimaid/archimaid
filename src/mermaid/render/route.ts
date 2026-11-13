import type { ElkPoint } from 'elkjs/lib/elk.bundled.js';
import type { ArchiMateModel } from '../../archimate/model.js';
import type { ArchiMateLogger } from '../archimateDiagram.js';
import { ancestors } from '../hierarchy.js';
import { bundleKind, routeArchitecture, type RouteBundle, type RoutingNode } from '../orthogonalRouter.js';
import { clearDecorations, clipCorner, overlayRoute, routePoints } from './elkRoutes.js';
import type { LayoutGraph } from './graph.js';
import type { DiagramLayout } from './layout.js';
import type { Placement } from './place.js';
import { usesArchitectureLayout, type EdgeAppearance, type EdgeEndpoint } from './shared.js';

export interface LabelStrategy {
  // A position the layout engine suggested, tried before searching.
  readonly hint?: ElkPoint;
  // Nested routes can leave the suggested position far from the drawn line, so it must also lie beside it.
  readonly hintNearRoute: boolean;
  // Architecture layout has no suggestions, so it searches every segment and the gaps between obstacles.
  readonly searchAllSegments: boolean;
}

// One shape for routes from either engine.
export interface RoutedEdge {
  readonly id: string;
  readonly appearance: EdgeAppearance;
  readonly points: ElkPoint[];
  readonly label: LabelStrategy;
  readonly bundle: RouteBundle | undefined;
}

export interface RouteInputs {
  readonly model: ArchiMateModel;
  readonly graph: LayoutGraph;
  readonly layout: DiagramLayout;
  readonly placement: Placement;
  readonly parents: ReadonlyMap<string, string>;
  readonly logger: ArchiMateLogger | undefined;
}

function architectureRoutes({
  model,
  graph,
  placement,
  parents,
  logger,
}: RouteInputs): ReturnType<typeof routeArchitecture> {
  const noteHosts = new Map((model.notes ?? []).map((note) => [note.id, note.on]));
  const routingNodes = new Map<string, RoutingNode>();
  for (const [key, endpoint] of placement.endpoints) {
    const parent = parents.get(noteHosts.get(key) ?? key);
    const obstacles = placement.decorations.get(key);
    routingNodes.set(key, {
      box: endpoint.box,
      ...(parent && { parent }),
      ...(obstacles && { decorations: obstacles }),
    });
  }
  return routeArchitecture(
    routingNodes,
    Array.from(graph.edges).flatMap(([edgeId, appearance]) =>
      appearance.overlayLane === undefined
        ? [
            {
              id: edgeId,
              source: appearance.relationship.source,
              target: appearance.relationship.target,
              sourceMarker: appearance.notation.start !== 'none',
              targetMarker: appearance.notation.end !== 'none',
              ...(noteHosts.has(appearance.relationship.source) || noteHosts.has(appearance.relationship.target)
                ? {}
                : { bundling: bundleKind(appearance.relationship) }),
            },
          ]
        : [],
    ),
    logger,
  );
}

function endpointsOf(placement: Placement, appearance: EdgeAppearance): readonly [EdgeEndpoint, EdgeEndpoint] {
  const source = placement.endpoints.get(appearance.relationship.source);
  const target = placement.endpoints.get(appearance.relationship.target);
  if (!source || !target) {
    throw new Error(`ELK did not position the endpoints of relationship "${appearance.relationship.id}".`);
  }
  return [source, target];
}

// Relationships within one attached-note group run in a channel beside the host, in either layout.
function overlayPoints(
  graph: LayoutGraph,
  appearance: EdgeAppearance,
  source: EdgeEndpoint,
  target: EdgeEndpoint,
): ElkPoint[] | undefined {
  const host = source.overlayHost ?? target.overlayHost;
  const laneCount =
    appearance.overlayKey === undefined ? undefined : graph.overlayLaneCounts.get(appearance.overlayKey);
  return host && laneCount && appearance.overlayLane !== undefined
    ? overlayRoute(source, target, host, (appearance.overlayLane + 1) / (laneCount + 1))
    : undefined;
}

function routeArchitectureEdges(inputs: RouteInputs): RoutedEdge[] {
  const { graph, placement } = inputs;
  const planned = architectureRoutes(inputs);
  return Array.from(graph.edges, ([id, appearance]) => {
    const [source, target] = endpointsOf(placement, appearance);
    let points = overlayPoints(graph, appearance, source, target);
    if (!points) {
      const path = planned.routes.get(id);
      const start = path?.[0];
      const next = path?.[1];
      const end = path?.at(-1);
      const previous = path?.at(-2);
      if (!path || !start || !next || !end || !previous) {
        throw new Error(`Missing architecture route for relationship "${appearance.relationship.id}".`);
      }
      points = path.slice();
      points[0] = clipCorner(start, next, source);
      points[points.length - 1] = clipCorner(end, previous, target);
    }
    return {
      id,
      appearance,
      points,
      label: { hintNearRoute: false, searchAllSegments: true },
      bundle: planned.bundles.get(id),
    };
  });
}

function routeElkEdges({ model, graph, layout, placement, parents }: RouteInputs): RoutedEdge[] {
  const noteHosts = new Map((model.notes ?? []).map((note) => [note.id, note.on]));
  return (layout.root.edges ?? []).map((route) => {
    const appearance = graph.edges.get(route.id);
    if (!appearance) {
      throw new Error('ELK returned an unknown ArchiMate relationship.');
    }
    const [source, target] = endpointsOf(placement, appearance);
    let points = overlayPoints(graph, appearance, source, target);
    if (!points) {
      const { source: sourceId, target: targetId } = appearance.relationship;
      const containers = new Set<string>();
      for (const id of [noteHosts.get(sourceId) ?? sourceId, noteHosts.get(targetId) ?? targetId]) {
        for (const ancestor of ancestors(id, parents)) containers.add(ancestor);
      }
      points = clearDecorations(
        routePoints(route, source, target),
        [
          ...placement.notes
            .filter(({ appearance: { note } }) => note.id !== sourceId && note.id !== targetId)
            .map(({ box }) => box),
          ...Array.from(placement.decorations.values()).flat(),
        ],
        placement.elements.filter(({ appearance: { element } }) => !containers.has(element.id)).map(({ box }) => box),
        source,
        target,
      );
    }
    const suggested = appearance.overlayLane === undefined ? route.labels?.[0] : undefined;
    const hint =
      suggested?.x !== undefined && suggested.y !== undefined && (suggested.x !== 0 || suggested.y !== 0)
        ? { x: suggested.x, y: suggested.y }
        : undefined;
    const [sourceNode] = route.sources;
    const [targetNode] = route.targets;
    const touchesNestedNode = graph.nested.has(sourceNode ?? '') || graph.nested.has(targetNode ?? '');
    const label = { ...(hint && { hint }), hintNearRoute: touchesNestedNode, searchAllSegments: false };
    return { id: route.id, appearance, points, label, bundle: undefined };
  });
}

export function routeDiagram(inputs: RouteInputs): RoutedEdge[] {
  return usesArchitectureLayout(inputs.model) ? routeArchitectureEdges(inputs) : routeElkEdges(inputs);
}
