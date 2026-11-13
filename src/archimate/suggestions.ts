// Optimal string alignment distance: a swapped pair of letters counts as one edit.
function editDistance(left: string, right: string): number {
  let previousRow: number[] = [];
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const nextRow = [i];
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      let distance = Math.min((row[j] ?? 0) + 1, (nextRow[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        distance = Math.min(distance, (previousRow[j - 2] ?? 0) + 1);
      }
      nextRow.push(distance);
    }
    previousRow = row;
    row = nextRow;
  }
  return row[right.length] ?? 0;
}

function closestMatch(value: string, candidates: Iterable<string>): string | undefined {
  const needle = value.toLowerCase();
  let best: string | undefined;
  let bestDistance = Infinity;
  let tied = false;
  for (const candidate of candidates) {
    const distance = editDistance(needle, candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tied = false;
    } else if (distance === bestDistance) {
      tied = true;
    }
  }
  if (best === undefined || tied) return undefined;
  return bestDistance <= Math.max(1, Math.floor(best.length / 4)) ? best : undefined;
}

export function withSuggestion(message: string, value: string, candidates: Iterable<string>): string {
  const suggestion = closestMatch(value, candidates);
  return suggestion === undefined ? message : message + ' Did you mean "' + suggestion + '"?';
}
