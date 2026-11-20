import { project } from './project';

// Below this, a visible count reads as "nobody uses this" rather than as social proof.
const MIN_STARS_SHOWN = 10;

let cached: Promise<number | null> | undefined;

// Read once per build, so visitors' browsers never call GitHub. A failed request only hides the count: the
// unauthenticated API is rate-limited per IP, and a shared build runner may hit that limit.
export function starCount(): Promise<number | null> {
  cached ??= fetchStarCount();
  return cached;
}

async function fetchStarCount(): Promise<number | null> {
  const apiUrl = project.repository.replace('https://github.com/', 'https://api.github.com/repos/');
  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn(`Star count unavailable: GitHub answered ${response.status} for ${apiUrl}`);
      return null;
    }
    const { stargazers_count: stars } = (await response.json()) as { stargazers_count?: unknown };
    if (typeof stars !== 'number') {
      console.warn(`Star count unavailable: no stargazers_count in the response from ${apiUrl}`);
      return null;
    }
    return stars >= MIN_STARS_SHOWN ? stars : null;
  } catch (error) {
    console.warn(`Star count unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function formatStars(stars: number): string {
  return stars >= 1000 ? `${(stars / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(stars);
}
