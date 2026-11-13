// Outward from the direct parent; containment is acyclic, which the parser enforces.
export function ancestors(id: string, parents: Pick<ReadonlyMap<string, string>, "get">): string[] {
  const found: string[] = [];
  for (let parent = parents.get(id); parent !== undefined; parent = parents.get(parent)) found.push(parent);
  return found;
}
