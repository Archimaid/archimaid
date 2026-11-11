import type { ExternalDiagramDefinition } from "mermaid";
import type { ArchiMatePalette } from "./styles.js";

const diagramId = "archimate";

export interface ArchiMatePluginOptions {
  readonly palette?: ArchiMatePalette;
  readonly diagramPadding?: number;
  readonly useMaxWidth?: boolean;
}

export function createArchiMatePlugin({
  palette = "modern",
  diagramPadding = 24,
  useMaxWidth = true,
}: ArchiMatePluginOptions = {}): ExternalDiagramDefinition {
  if (!Number.isFinite(diagramPadding) || diagramPadding < 0) {
    throw new RangeError("ArchiMate diagramPadding must be a finite, nonnegative number.");
  }
  if (typeof useMaxWidth !== "boolean") {
    throw new TypeError("ArchiMate useMaxWidth must be a boolean.");
  }
  return {
    id: diagramId,
    detector: (text) => /^\s*archimate-beta(?=\s|$)/u.test(text),
    async loader() {
      const { createArchimateDiagram } = await import("./archimateDiagram.js");
      return { id: diagramId, diagram: createArchimateDiagram({ palette, diagramPadding, useMaxWidth }) };
    },
  };
}

export const archimate = createArchiMatePlugin();
