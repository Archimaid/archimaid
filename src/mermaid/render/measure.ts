import { getElementType } from "../../archimate/catalogue.js";
import type { ArchiMateModel } from "../../archimate/model.js";
import type { DiagramTypography } from "../styles.js";
import {
  edgeLabelClass, edgeLabelWrapWidth, labelClass, lineHeightFactor, nameWrapWidth, noteWrapWidth, titleClass,
  type Element, type ElementType, type TextMetrics,
} from "./shared.js";
import { append } from "./svg.js";

function breakWord(word: string, maxWidth: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  let current = "";
  // Hyphens and underscores stay at the end of a line, where readers expect a continuation.
  for (const piece of word.split(/(?<=[-_])/u)) {
    if (measure(current + piece) <= maxWidth) {
      current += piece;
      continue;
    }
    if (current) lines.push(current);
    current = "";
    if (measure(piece) <= maxWidth) {
      current = piece;
      continue;
    }
    for (const character of Array.from(piece)) {
      if (current && measure(current + character) > maxWidth) {
        lines.push(current);
        current = character;
      } else {
        current += character;
      }
    }
  }
  lines.push(current);
  return lines;
}

function measureText(
  textElement: SVGTextElement,
  text: string,
  className: string,
  size: number,
  maxWidth?: number,
): TextMetrics {
  const lineHeight = Math.ceil(size * lineHeightFactor);
  textElement.setAttribute("class", className);
  const measure = (line: string) => {
    textElement.textContent = line;
    return textElement.getComputedTextLength() || Array.from(line).length * size;
  };
  const lines = text.split(/\r\n?|\n/u).flatMap((line) => {
    if (maxWidth === undefined || measure(line) <= maxWidth) {
      return [line];
    }

    const wrapped: string[] = [];
    let current = "";
    // Non-breaking spaces are an author's request to keep words on one line.
    for (const word of line.trim().split(/[^\S\u00a0\u2007\u202f]+/u)) {
      const next = current ? `${current} ${word}` : word;
      if (!current || measure(next) <= maxWidth) {
        current = next;
      } else {
        wrapped.push(current);
        current = word;
      }
      if (measure(current) > maxWidth) {
        const pieces = breakWord(current, maxWidth, measure);
        current = pieces.pop() ?? "";
        wrapped.push(...pieces);
      }
    }
    wrapped.push(current);
    return wrapped;
  });
  const width = Math.max(...lines.map(measure));
  return { lines, width: Math.ceil(width), height: lines.length * lineHeight, lineHeight };
}

export interface MeasuredElement {
  readonly element: Element;
  readonly type: ElementType;
  readonly notation: NonNullable<ElementType["notation"]>;
  readonly label: TextMetrics;
}

export interface MeasuredDiagram {
  readonly title: TextMetrics | undefined;
  // In model order, so their index still names their layout node.
  readonly notes: readonly TextMetrics[];
  readonly elements: readonly MeasuredElement[];
  readonly relationshipLabels: ReadonlyMap<string, TextMetrics>;
}

// Text is measured in the diagram's own SVG, where Mermaid's style sheet sets the fonts.
export function measureDiagram(
  svg: SVGSVGElement, model: ArchiMateModel, title: string, typography: DiagramTypography,
): MeasuredDiagram {
  const measure = append(svg, "text", { visibility: "hidden" });
  try {
    const titleMetrics = title ? measureText(measure, title, titleClass, typography.titleSize) : undefined;
    const notes = (model.notes ?? []).map((note) =>
      measureText(measure, note.text, labelClass, typography.labelSize, noteWrapWidth));
    const elements = model.elements.map((element) => {
      const type = getElementType(element.type);
      if (!type?.notation) {
        throw new Error(`SVG notation for element type "${element.type}" is not implemented.`);
      }
      const label = measureText(measure, element.name, labelClass, typography.labelSize, nameWrapWidth);
      return { element, type, notation: type.notation, label };
    });
    const relationshipLabels = new Map(model.relationships.flatMap((relationship) => relationship.label
      ? [[relationship.id, measureText(
        measure, relationship.label, edgeLabelClass, typography.edgeLabelSize, edgeLabelWrapWidth,
      )] as const]
      : []));
    return { title: titleMetrics, notes, elements, relationshipLabels };
  } finally {
    measure.remove();
  }
}
