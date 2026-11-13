import type { SpecifiedAccessMode } from './catalogue.js';

export type ArchiMateDirection = 'TB' | 'BT' | 'LR' | 'RL';
export type ArchiMateLayout = 'architecture' | 'framework' | 'graph';

export type ArchiMateLinkTarget = '_blank' | '_self' | '_parent' | '_top';

export interface ArchiMateLink {
  readonly href: string;
  readonly tooltip?: string;
  readonly target?: ArchiMateLinkTarget;
}

export interface ArchiMateElement {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly description?: string;
  readonly link?: ArchiMateLink;
}

export interface ArchiMateRelationship {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly access?: SpecifiedAccessMode;
  readonly directed?: boolean;
}

export interface ArchiMateNote {
  readonly id: string;
  readonly text: string;
  readonly on?: string;
}

// Without a relationship, nesting only groups the child visually inside its parent.
export interface ArchiMateNesting {
  readonly child: string;
  readonly parent: string;
  readonly relationship?: string;
}

export interface ArchiMateModel {
  readonly direction: ArchiMateDirection;
  readonly layout?: ArchiMateLayout;
  readonly title?: string;
  readonly accTitle?: string;
  readonly accDescription?: string;
  readonly elements: readonly ArchiMateElement[];
  readonly relationships: readonly ArchiMateRelationship[];
  readonly notes?: readonly ArchiMateNote[];
  readonly nesting?: readonly ArchiMateNesting[];
}
