import type { ExternalDiagramDefinition, MermaidConfig } from "mermaid";
import type { ArchiMateModel } from "../archimate/model.js";
import { parseArchiMate } from "../archimate/parser.js";
import { renderArchiMate } from "./archimateRenderer.js";
import { archimateStyles } from "./styles.js";

type DiagramDefinition = Awaited<ReturnType<ExternalDiagramDefinition["loader"]>>["diagram"];

export function createArchimateDiagram(): DiagramDefinition {
  let model: ArchiMateModel | undefined;
  let diagramTitle: string | undefined;
  let frontmatterLineOffset = 0;
  let getConfig: (() => MermaidConfig) | undefined;

  return {
    db: {
      preserveCommentsWhenParsing: true,
      setFrontmatterLineOffset(offset) {
        frontmatterLineOffset = offset;
      },
      clear() {
        model = undefined;
        diagramTitle = undefined;
        frontmatterLineOffset = 0;
      },
      setDiagramTitle(title) {
        diagramTitle = title;
      },
      getDiagramTitle() {
        return model?.title ?? diagramTitle ?? "";
      },
      getAccTitle() {
        return model?.accTitle ?? model?.title ?? diagramTitle ?? "";
      },
      getAccDescription() {
        return model?.accDescription ?? "";
      },
    },
    parser: {
      parse(source) {
        model = undefined;
        // Mermaid encodes #name; and #123; before dispatch. Quoted ArchiMate
        // text treats these sequences literally, so restore them before parsing.
        const literalSource = source.replace(/ﬂ°°?(\w+)¶ß/gu, "#$1;");
        model = parseArchiMate(literalSource, { lineOffset: frontmatterLineOffset });
      },
    },
    renderer: {
      async draw(_text, id, _version, diagram) {
        if (!model) {
          throw new Error("Parse an ArchiMate diagram before rendering it.");
        }

        await renderArchiMate(model, id, diagram.db.getDiagramTitle?.() ?? "", getConfig?.());
      },
    },
    styles: archimateStyles,
    injectUtils(_log, _setLogLevel, readConfig: () => MermaidConfig) {
      getConfig = readConfig;
    },
  };
}
