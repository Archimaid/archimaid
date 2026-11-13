import type { ExternalDiagramDefinition } from "mermaid";
import type { ArchiMatePalette } from "./styles.js";

const diagramId = "archimate";

export interface ArchiMatePluginOptions {
  readonly palette?: ArchiMatePalette;
  readonly diagramPadding?: number;
  readonly useMaxWidth?: boolean;
  readonly maxRowWidth?: number;
  readonly background?: ArchiMateBackground;
}

export type ArchiMateBackground = "theme" | "transparent";

export function createArchiMatePlugin({
  palette = "modern",
  diagramPadding = 24,
  useMaxWidth = true,
  maxRowWidth = 1200,
  background = "theme",
}: ArchiMatePluginOptions = {}): ExternalDiagramDefinition {
  if (!Number.isFinite(diagramPadding) || diagramPadding < 0) {
    throw new RangeError("ArchiMate diagramPadding must be a finite, nonnegative number.");
  }
  // Infinity is accepted and turns row wrapping off.
  if (typeof maxRowWidth !== "number" || Number.isNaN(maxRowWidth) || maxRowWidth <= 0) {
    throw new RangeError("ArchiMate maxRowWidth must be a number greater than 0, or Infinity.");
  }
  if (background !== "theme" && background !== "transparent") {
    throw new RangeError(`ArchiMate background must be "theme" or "transparent".`);
  }
  if (typeof useMaxWidth !== "boolean") {
    throw new TypeError("ArchiMate useMaxWidth must be a boolean.");
  }
  return {
    id: diagramId,
    detector: (text) => /^\s*archimate-beta(?=\s|$)/u.test(text),
    async loader() {
      const { createArchimateDiagram } = await import("./archimateDiagram.js");
      const diagram = createArchimateDiagram({ palette, diagramPadding, useMaxWidth, maxRowWidth, background });
      return { id: diagramId, diagram };
    },
  };
}

export const archimate = createArchiMatePlugin();
