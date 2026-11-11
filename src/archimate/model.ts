import type { AccessMode } from './catalogue.js';

export type ArchiMateDirection = 'TB' | 'BT' | 'LR' | 'RL';
export type ArchiMateLayout = 'architecture' | 'framework' | 'graph';

export interface ArchiMateElement {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly description?: string;
}

export interface ArchiMateRelationship {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly access?: AccessMode;
  readonly directed?: boolean;
}

export interface ArchiMateNote {
  readonly id: string;
  readonly text: string;
  readonly on?: string;
}

export interface ArchiMateNesting {
  readonly child: string;
  readonly parent: string;
  readonly relationship: string;
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
