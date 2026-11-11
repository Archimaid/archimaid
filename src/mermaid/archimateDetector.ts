import type { ExternalDiagramDefinition } from "mermaid";

const diagramId = "archimate";

export const archimate: ExternalDiagramDefinition = {
  id: diagramId,
  detector: (text) => /^\s*archimate-beta(?=\s|$)/u.test(text),
  async loader() {
    const { createArchimateDiagram } = await import("./archimateDiagram.js");
    return { id: diagramId, diagram: createArchimateDiagram() };
  },
};
