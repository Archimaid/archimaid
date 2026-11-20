import { deflateRawSync } from 'node:zlib';
import { project } from './project';

export type DesignerMode = 'view' | 'design';

// Matches the designer's share links: raw DEFLATE, then base64url without padding, in a `#code=` hash. The
// mode is explicit, so a link opens the same way whichever mode the visitor used last.
export function designerLink(source: string, mode: DesignerMode): string {
  return `${project.designer}/?mode=${mode}#code=${deflateRawSync(source).toString('base64url')}`;
}
