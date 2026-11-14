import { deflateRawSync } from 'node:zlib';
import { project } from './project';

// Matches the playground's share links: raw DEFLATE, then base64url without padding, in a `#code=` hash.
export function playgroundLink(source: string): string {
  return `${project.playground}/#code=${deflateRawSync(source).toString('base64url')}`;
}
