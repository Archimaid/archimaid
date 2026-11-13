import type { Box, Point } from "../architectureLayout.js";
import { busyDegree } from "./constants.js";
import { centre, oppositeSide, type Side } from "./primitives.js";
import { ancestorIds, boxOf, type RoutingEdge, type RoutingNode } from "./types.js";

export interface BundleGroup {
  readonly id: string;
  readonly element: string;
  readonly side: Side;
  readonly sharedEnd: "start" | "end";
  readonly marker: boolean;
  readonly members: readonly RoutingEdge[];
}

// A far element directly above or below gets a straight line from the facing side. Anything else
// joins a trunk on the left or right side, which then runs along the gap between rows.
export function bundleSide(shared: Box, far: Box): Side {
  if (far.x < shared.x + shared.width && far.x + far.width > shared.x) {
    return far.y < shared.y ? "top" : "bottom";
  }
  return centre(far).x < centre(shared).x ? "left" : "right";
}

export function farSide(group: Side, anchor: Point, far: Box): Side {
  if (group === "top") return "bottom";
  if (group === "bottom") return "top";
  if (far.y + far.height <= anchor.y) return "bottom";
  if (far.y >= anchor.y) return "top";
  return oppositeSide[group];
}

// Relationships of one kind that leave, or arrive at, the same element share an anchor and a trunk.
// The groups keep the order in which they were found, which decides routing order.
export function planBundles(
  nodes: ReadonlyMap<string, RoutingNode>, edges: readonly RoutingEdge[],
): ReadonlyMap<string, BundleGroup> {
  const eligible = edges.filter((edge) => {
    if (edge.bundling === undefined || edge.source === edge.target) return false;
    return !ancestorIds(edge.source, nodes).includes(edge.target) && !ancestorIds(edge.target, nodes).includes(edge.source);
  });
  const candidates = new Map<string, RoutingEdge[]>();
  const kindKey = ({ bundling }: RoutingEdge) => [bundling?.type, bundling?.access, bundling?.directed];
  const keys = (edge: RoutingEdge) => [
    { key: JSON.stringify([edge.source, ...kindKey(edge), "start"]), element: edge.source, sharedEnd: "start" as const },
    { key: JSON.stringify([edge.target, ...kindKey(edge), "end"]), element: edge.target, sharedEnd: "end" as const },
  ];
  for (const edge of eligible) {
    for (const { key } of keys(edge)) candidates.set(key, [...candidates.get(key) ?? [], edge]);
  }
  const eligibleDegrees = new Map<string, number>();
  for (const { source, target } of eligible) {
    for (const id of [source, target]) eligibleDegrees.set(id, (eligibleDegrees.get(id) ?? 0) + 1);
  }
  const groups = new Map<string, BundleGroup & { readonly members: RoutingEdge[] }>();
  for (const edge of eligible) {
    const [atSource, atTarget] = keys(edge);
    if (!atSource || !atTarget) continue;
    const sourceSize = candidates.get(atSource.key)?.length ?? 0;
    const targetSize = candidates.get(atTarget.key)?.length ?? 0;
    const sourceDegree = eligibleDegrees.get(edge.source) ?? 0;
    const targetDegree = eligibleDegrees.get(edge.target) ?? 0;
    // A lone relationship still gets a planned anchor at a busy element, so its trunk nests with the bundles there.
    const chosen = Math.max(sourceSize, targetSize) >= 2
      ? sourceSize >= targetSize ? atSource : atTarget
      : Math.max(sourceDegree, targetDegree) >= busyDegree
        ? sourceDegree >= targetDegree ? atSource : atTarget
        : undefined;
    if (!chosen) continue;
    const far = chosen.sharedEnd === "start" ? edge.target : edge.source;
    const side = bundleSide(boxOf(nodes, chosen.element), boxOf(nodes, far));
    const id = JSON.stringify([chosen.key, side]);
    const group = groups.get(id);
    // Two relationships of one kind between the same pair would coincide completely, so the copy routes alone.
    const farOf = (member: RoutingEdge) => chosen.sharedEnd === "start" ? member.target : member.source;
    if (group?.members.some((member) => farOf(member) === far)) continue;
    if (group) group.members.push(edge);
    else {
      groups.set(id, {
        id, element: chosen.element, side, sharedEnd: chosen.sharedEnd, members: [edge],
        marker: (chosen.sharedEnd === "start" ? edge.sourceMarker : edge.targetMarker) ?? false,
      });
    }
  }
  return groups;
}
