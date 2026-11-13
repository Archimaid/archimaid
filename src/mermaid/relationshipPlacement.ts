import type { Arrangement, LayoutRelationship, PlacedNode, SizedNode } from './architectureLayout.js';
import { required } from './invariant.js';

interface Endpoint {
  owner: SizedNode;
  offset: number;
  nested: boolean;
}

interface Link {
  source: Endpoint;
  target: Endpoint;
  type: string;
}

interface Rank {
  layer: string;
  nodes: SizedNode[];
}

function project(nodes: readonly SizedNode[], relationships: readonly LayoutRelationship[]): Link[] {
  const endpoints = new Map<string, Endpoint>();
  for (const owner of nodes) {
    function visit(node: PlacedNode, left: number): void {
      endpoints.set(node.id, {
        owner,
        offset: left + node.width / 2 - owner.node.width / 2,
        nested: node !== owner.node,
      });
      for (const child of node.children ?? []) visit(child, left + child.x);
    }
    visit(owner.node, 0);
  }
  return relationships.flatMap(({ source, target, type }) => {
    const from = endpoints.get(source);
    const to = endpoints.get(target);
    return from && to && from !== to ? [{ source: from, target: to, type }] : [];
  });
}

function layerRanks(nodes: readonly SizedNode[], links: readonly Link[]): SizedNode[][] {
  const groups = new Map<SizedNode, SizedNode>();
  function root(node: SizedNode): SizedNode {
    let member = node;
    for (let parent = groups.get(member); parent; parent = groups.get(member)) member = parent;
    if (node !== member) groups.set(node, member);
    return member;
  }
  for (const { source, target, type } of links) {
    if (type !== 'triggering') continue;
    const a = root(source.owner);
    const b = root(target.owner);
    if (a !== b) groups.set(b, a);
  }
  const members = [...new Set(nodes.map(root))];
  const incoming = new Map(members.map((node) => [node, 0]));
  const outgoing = new Map<SizedNode, Set<SizedNode>>();
  const values = new Map<SizedNode, number>();
  const adjacent = new Map<SizedNode, SizedNode[]>();
  function connect(a: SizedNode, b: SizedNode): void {
    const neighbors = adjacent.get(a);
    if (neighbors) neighbors.push(b);
    else adjacent.set(a, [b]);
  }
  for (const { source, target, type } of links) {
    const a = root(source.owner);
    const b = root(target.owner);
    if (a === b) continue;
    connect(a, b);
    connect(b, a);
    const deployment = type === 'assignment' && a.row === 'technology' && target.owner.column === 'passiveStructure';
    const ordered =
      type === 'realization' || type === 'serving' || deployment
        ? ([b, a] as const)
        : type === 'assignment' && a.row !== 'technology'
          ? ([a, b] as const)
          : undefined;
    if (!ordered) continue;
    const [above, below] = ordered;
    let targets = outgoing.get(above);
    if (!targets) {
      targets = new Set();
      outgoing.set(above, targets);
    }
    if (!targets.has(below)) {
      targets.add(below);
      incoming.set(below, (incoming.get(below) ?? 0) + 1);
    }
  }
  const unranked = new Set(members);
  function assign(ready: SizedNode[]): void {
    for (const node of ready) {
      if (!unranked.delete(node)) continue;
      for (const target of outgoing.get(node) ?? []) {
        if (!unranked.has(target)) continue;
        values.set(target, Math.max(values.get(target) ?? 0, (values.get(node) ?? 0) + 1));
        const remaining = (incoming.get(target) ?? 0) - 1;
        incoming.set(target, remaining);
        if (remaining === 0) ready.push(target);
      }
    }
  }
  assign(members.filter((node) => incoming.get(node) === 0));
  for (const node of members) if (unranked.has(node)) assign([node]);

  const ranks = new Map<number, SizedNode[]>();
  for (const node of nodes) {
    const owner = root(node);
    const neighbors = adjacent.get(owner) ?? [];
    const rank =
      values.get(owner) ??
      (outgoing.has(owner)
        ? 0
        : neighbors.reduce((deepest, neighbor) => Math.max(deepest, values.get(neighbor) ?? 0), 0));
    const siblings = ranks.get(rank);
    if (siblings) siblings.push(node);
    else ranks.set(rank, [node]);
  }
  return [...ranks].sort(([a], [b]) => a - b).map(([, nodes]) => nodes);
}

interface Preference {
  center: number;
  weight: number;
}

function preferredCenter(preferences: Preference[]): Preference {
  preferences.sort((a, b) => a.center - b.center);
  const weight = preferences.reduce((sum, preference) => sum + preference.weight, 0);
  let accumulated = 0;
  for (const [index, preference] of preferences.entries()) {
    accumulated += preference.weight;
    if (accumulated < weight / 2) continue;
    const next = preferences[index + 1];
    const center = accumulated === weight / 2 && next ? (preference.center + next.center) / 2 : preference.center;
    return { center, weight };
  }
  return { center: 0, weight: 1 };
}

function pack(nodes: readonly PlacedNode[], preferred: ReadonlyMap<PlacedNode, Preference>, gap: number): void {
  let offset = 0;
  const offsets = nodes.map((node) => {
    const center = offset + node.width / 2;
    offset += node.width + gap;
    return center;
  });
  const blocks: { first: number; last: number; mean: number; weight: number }[] = [];
  for (const [index, node] of nodes.entries()) {
    const position = offsets[index] ?? 0;
    const { center, weight } = preferred.get(node) ?? { center: position, weight: 1 };
    const block = { first: index, last: index, mean: center - position, weight };
    // Merge conflicting positions, keeping the ordered boxes at least one gap apart.
    while (true) {
      const previous = blocks.at(-1);
      if (!previous || previous.mean <= block.mean) break;
      blocks.pop();
      block.first = previous.first;
      block.mean = (previous.mean * previous.weight + block.mean * block.weight) / (previous.weight + block.weight);
      block.weight += previous.weight;
    }
    blocks.push(block);
  }
  for (const { first, last, mean } of blocks) {
    for (let index = first; index <= last; index++) {
      const node = nodes[index];
      if (node) node.x = (offsets[index] ?? 0) + mean - node.width / 2;
    }
  }
}

function rowWidth(nodes: readonly SizedNode[], gap: number): number {
  return nodes.reduce((sum, { node }) => sum + node.width + gap, -gap);
}

function initialOrder(nodes: readonly SizedNode[], triggers: ReadonlyMap<string, readonly string[]>): PlacedNode[] {
  return sequence(
    [...nodes].sort((a, b) => Number(b.column === 'passiveStructure') - Number(a.column === 'passiveStructure')),
    triggers,
  );
}

function wrapRank(rank: Rank, ordered: readonly PlacedNode[], gap: number, maxWidth: number): Rank[] {
  const width = rowWidth(rank.nodes, gap);
  if (width <= maxWidth) return [rank];
  const owners = new Map(rank.nodes.map((owner) => [owner.node, owner]));
  const count = Math.ceil((width + gap) / (maxWidth + gap));
  // Balance the rows around an equal share instead of filling each row to the limit.
  const share = (width + gap) / count;
  const rows: SizedNode[][] = [];
  let row: SizedNode[] = [];
  let used = 0;
  for (const node of ordered) {
    const owner = required(owners.get(node), 'the ranked node of a wrapped row');
    const size = node.width + gap;
    if (row.length && (used + size > share + size / 2 || used + node.width > maxWidth)) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(owner);
    used += size;
  }
  rows.push(row);
  return rows.map((nodes) => ({ layer: rank.layer, nodes }));
}

export function placeConnectedLayers(
  nodes: readonly SizedNode[],
  layers: readonly string[],
  relationships: readonly LayoutRelationship[],
  gap: number,
  layerGap: number,
  maxRowWidth: number,
): Arrangement {
  const projected = project(nodes, relationships);
  const links = projected.filter(({ source, target }) => source.owner !== target.owner);
  const incident = new Map<SizedNode, Link[]>();
  const triggers = new Map<string, string[]>();
  for (const link of links) {
    const { source, target, type } = link;
    for (const { owner } of [source, target]) {
      const edges = incident.get(owner);
      if (edges) edges.push(link);
      else incident.set(owner, [link]);
    }
    if (type === 'triggering') {
      const outgoing = triggers.get(source.owner.node.id);
      if (outgoing) outgoing.push(target.owner.node.id);
      else triggers.set(source.owner.node.id, [target.owner.node.id]);
    }
  }
  const ranks: Rank[] = layers.flatMap((layer) =>
    layerRanks(
      nodes.filter(({ row }) => row === layer),
      links.filter(({ source, target }) => source.owner.row === layer && target.owner.row === layer),
    ).flatMap((nodes) => {
      const rank = { layer, nodes };
      return wrapRank(rank, initialOrder(nodes, triggers), gap, maxRowWidth);
    }),
  );
  const rankByNode = new Map(ranks.flatMap((rank) => rank.nodes.map((node) => [node, rank] as const)));
  const processRanks = new Set<Rank>();
  for (const { source, target, type } of projected) {
    const rank = rankByNode.get(source.owner);
    if (type === 'triggering' && rank && rank === rankByNode.get(target.owner)) processRanks.add(rank);
  }

  let anchor = 0;
  let anchorWidth = 0;
  let anchorHasProcess = false;
  const original = new Map<PlacedNode, number>();
  for (const [index, rank] of ranks.entries()) {
    const ordered = initialOrder(rank.nodes, triggers);
    const width = rowWidth(rank.nodes, gap);
    const hasProcess = processRanks.has(rank);
    if ((hasProcess && !anchorHasProcess) || (hasProcess === anchorHasProcess && width > anchorWidth)) {
      anchor = index;
      anchorWidth = width;
      anchorHasProcess = hasProcess;
    }
    let left = -width / 2;
    for (const node of ordered) {
      node.x = left;
      original.set(node, left + node.width / 2);
      left += node.width + gap;
    }
  }

  const nearby = new Set<Rank>();
  const anchored = ranks[anchor];
  if (anchored) nearby.add(anchored);
  function align(rank: Rank): void {
    const preferred = new Map<PlacedNode, Preference>();
    for (const owner of rank.nodes) {
      const node = owner.node;
      const positions = [{ center: original.get(node) ?? 0, weight: 0.25 }];
      for (const { source, target, type } of incident.get(owner) ?? []) {
        const here = source.owner === owner ? source : target;
        const there = source.owner === owner ? target : source;
        const other = rankByNode.get(there.owner);
        if (!other || !nearby.has(other)) continue;
        const neighbor = there.owner.node;
        const vertical = type === 'realization' || type === 'serving';
        const hostingPeer = type === 'assignment' && rank.layer === 'technology' && here === source;
        if (other === rank && type !== 'access' && !hostingPeer) continue;
        const separation = type === 'access' ? (neighbor.width + node.width) / 2 + gap : 0;
        const weight = vertical ? (here.nested || there.nested ? 10 : 5) : type === 'access' ? 2 : 1;
        positions.push({
          center:
            neighbor.x + neighbor.width / 2 + there.offset - here.offset + (here === source ? separation : -separation),
          weight,
        });
      }
      preferred.set(node, preferredCenter(positions));
    }
    const ordered = sequence(
      [...rank.nodes].sort((a, b) => (preferred.get(a.node)?.center ?? 0) - (preferred.get(b.node)?.center ?? 0)),
      triggers,
    );
    pack(ordered, preferred, gap);
    nearby.add(rank);
  }
  for (let distance = 1; distance < ranks.length; distance++) {
    const above = ranks[anchor - distance];
    const below = ranks[anchor + distance];
    if (above) align(above);
    if (below) align(below);
  }
  for (const sweep of [ranks, ranks.toReversed()]) {
    for (const rank of sweep) if (rank !== anchored) align(rank);
  }

  let left = 0;
  let right = 0;
  let height = 0;
  let previousLayer: string | undefined;
  for (const rank of ranks) {
    if (previousLayer !== undefined) height += previousLayer === rank.layer ? gap : layerGap;
    const rowHeight = rank.nodes.reduce((maximum, { node }) => Math.max(maximum, node.height), 0);
    for (const { node } of rank.nodes) {
      node.y = height + (rowHeight - node.height) / 2;
      left = Math.min(left, node.x);
      right = Math.max(right, node.x + node.width);
    }
    height += rowHeight;
    previousLayer = rank.layer;
  }
  const children = nodes.map(({ node }) => node);
  for (const node of children) node.x -= left;
  return { width: right - left, height, children };
}

export function sequence(nodes: readonly SizedNode[], flows: ReadonlyMap<string, readonly string[]>): PlacedNode[] {
  const pending = new Map(nodes.map(({ node }) => [node.id, 0]));
  for (const { node } of nodes) {
    for (const target of flows.get(node.id) ?? []) {
      const count = pending.get(target);
      if (count !== undefined) pending.set(target, count + 1);
    }
  }
  const byId = new Map(nodes.map(({ node }) => [node.id, node]));
  const ready = nodes.filter(({ node }) => pending.get(node.id) === 0).map(({ node }) => node);
  const ordered: PlacedNode[] = [];
  function drainReady(): void {
    for (const member of ready) {
      if (!pending.delete(member.id)) continue;
      ordered.push(member);
      for (const target of flows.get(member.id) ?? []) {
        const count = pending.get(target);
        const next = byId.get(target);
        if (count === undefined || !next) continue;
        pending.set(target, count - 1);
        if (count === 1) ready.push(next);
      }
    }
    ready.length = 0;
  }
  drainReady();
  for (const { node } of nodes) {
    // When every remaining node has a predecessor, break the cycle in declaration order.
    if (!pending.has(node.id)) continue;
    ready.push(node);
    drainReady();
  }
  return ordered;
}
