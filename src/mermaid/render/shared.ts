import type { ElkNode, ElkPoint } from "elkjs/lib/elk.bundled.js";
import type { getElementType, getRelationshipNotation } from "../../archimate/catalogue.js";
import type { ArchiMateModel, ArchiMateNote } from "../../archimate/model.js";
import { markerExtent } from "../geometry.js";

export const layoutPadding = 24;
export const strokeGutter = 2;
// Allow for the longest marker and its outline on low-padding diagrams.
export const markerReach = markerExtent;
export const cornerRadius = 9;
export const iconSize = 14;
export const iconInset = 3;
export const iconScale = iconSize / 16;
export const iconLabelGap = 4;
export const compoundLabelInset = 8;
export const noteFold = 12;
export const noteInset = 12;
export const noteOverlap = 1;
export const minimumElementWidth = 124;
export const minimumHeaderHeight = 54;
export const headerLabelPadding = 20;
// Labels without an icon keep this much room on each side.
export const plainLabelInset = 14;
export const minimumNoteHeight = 48;
// Horizontal padding around a relationship label inside its backing.
export const edgeLabelPadding = 8;
export const titleGap = 12;
export const lineHeightFactor = 1.3;
// ELK gaps between elements in a layer and between layers, tuned for orthogonal routes and their labels.
export const elkNodeSpacing = 38;
export const elkLayerSpacing = 76;
export const nameWrapWidth = 200;
export const edgeLabelWrapWidth = 180;
export const noteWrapWidth = 240;
export const labelClass = "archimate-label";
export const titleClass = `${labelClass} archimate-title`;
export const edgeLabelClass = `${labelClass} archimate-edge-label`;

export type Element = ArchiMateModel["elements"][number];
export type Relationship = ArchiMateModel["relationships"][number];
export type ElementType = NonNullable<ReturnType<typeof getElementType>>;
export type Outline = NonNullable<ElementType["notation"]>["outline"];
export type RelationshipNotation = NonNullable<ReturnType<typeof getRelationshipNotation>>;
export type Marker = Exclude<RelationshipNotation["start"], "none">;
export type MeasuredElkNode = ElkNode & { width: number; height: number; children?: MeasuredElkNode[] };

export interface TextMetrics {
  lines: readonly string[];
  width: number;
  height: number;
  lineHeight: number;
}

export interface NodeAppearance {
  element: Element;
  type: ElementType;
  notation: NonNullable<ElementType["notation"]>;
  label: TextMetrics;
  headerHeight: number;
  notesHeight: number;
}

export interface NoteAppearance {
  note: ArchiMateNote;
  label: TextMetrics;
  width: number;
  height: number;
}

export interface EdgeAppearance {
  relationship: Relationship;
  accessibleName: string;
  notation: RelationshipNotation;
  label: TextMetrics | undefined;
  overlayLane?: number;
  overlayKey?: string;
}

export interface PositionedNode extends ElkPoint {
  width: number;
  height: number;
}

export interface EdgeEndpoint {
  box: PositionedNode;
  outline: Outline | "note";
  overlayHost?: PositionedNode;
}

export function iconRightInset(outline: Outline): number {
  // Leave room for the diagonal at the top right of motivation figures.
  return outline === "chamfered" ? cornerRadius - iconInset + 1 : iconInset;
}

export function positioned(node: ElkNode): PositionedNode {
  const { x, y, width, height } = node;
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    throw new Error("ELK did not return a position and size for an ArchiMate element.");
  }
  return { x, y, width, height };
}

export function usesArchitectureLayout(model: ArchiMateModel): boolean {
  return model.layout === "architecture" || model.layout === "framework";
}

// Relationships leave upward in BT, so attached notes sit on the entry side, mirroring TB.
export function notesBelowHost(model: ArchiMateModel): boolean {
  return !usesArchitectureLayout(model) && model.direction === "BT";
}
