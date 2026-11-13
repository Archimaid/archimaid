import type { Box, Point } from '../architectureLayout.js';
import { ancestors } from '../hierarchy.js';

export interface RoutingNode {
  readonly box: Box;
  readonly parent?: string;
  readonly decorations?: readonly Box[];
}

export interface RoutingEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourceMarker?: boolean;
  readonly targetMarker?: boolean;
  // Absent means the relationship is never bundled, as for relationships of notes.
  readonly bundling?: BundleKind;
}

// Relationships drawn alike may share a line, so a bundle needs the same type, access mode and direction.
export interface BundleKind {
  readonly type: string;
  readonly access: string;
  readonly directed: boolean;
}

export function bundleKind({
  type,
  access,
  directed,
}: {
  readonly type: string;
  readonly access?: string | undefined;
  readonly directed?: boolean | undefined;
}): BundleKind {
  return { type, access: access ?? 'unspecified', directed: directed ?? false };
}

export interface RoutingOptions {
  readonly warn?: (message: string) => void;
}

export interface RouteBundle {
  readonly id: string;
  // Members of a bundle coincide from the end they share: their start, or their end.
  readonly sharedEnd: 'start' | 'end';
}

export interface ArchitectureRoutes {
  readonly routes: ReadonlyMap<string, readonly Point[]>;
  readonly bundles: ReadonlyMap<string, RouteBundle>;
}

export function ancestorIds(id: string, nodes: ReadonlyMap<string, RoutingNode>): string[] {
  return ancestors(id, { get: (child) => nodes.get(child)?.parent });
}

export function boxOf(nodes: ReadonlyMap<string, RoutingNode>, id: string): Box {
  const node = nodes.get(id);
  if (!node) throw new Error(`Missing endpoint "${id}" for an ArchiMate relationship.`);
  return node.box;
}
