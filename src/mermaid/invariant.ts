// For values the surrounding code guarantees. A missing one is a bug here, not a problem with the diagram.
export function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`ArchiMate internal error: ${what} is missing.`);
  return value;
}
