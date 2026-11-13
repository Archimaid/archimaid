import type { ExternalDiagramDefinition, MermaidConfig } from 'mermaid';
import type { ArchiMateModel } from '../archimate/model.js';
import { parseArchiMate } from '../archimate/parser.js';
import type { ArchiMatePluginOptions } from './archimateDetector.js';
import { renderArchiMate } from './archimateRenderer.js';
import { archimatePalettes, archimateStyles } from './styles.js';

type DiagramDefinition = Awaited<ReturnType<ExternalDiagramDefinition['loader']>>['diagram'];

// The markers Mermaid wraps around the name or number of a #name; or #123; sequence.
const mermaidEntityMarker = /ﬂ°°?(\w+)¶ß/gu;

export interface ArchiMateLogger {
  readonly warn: (message: string) => void;
}

export function toLogger(log: unknown): ArchiMateLogger | undefined {
  if (typeof log !== 'object' || log === null || !('warn' in log)) return undefined;
  const { warn } = log;
  return typeof warn === 'function'
    ? {
        warn: (message) => {
          warn.call(log, message);
        },
      }
    : undefined;
}

export function createArchimateDiagram(options: Required<ArchiMatePluginOptions>): DiagramDefinition {
  if (!Object.hasOwn(archimatePalettes, options.palette)) {
    throw new RangeError(`Unknown ArchiMate palette "${options.palette}".`);
  }
  let model: ArchiMateModel | undefined;
  let diagramTitle: string | undefined;
  let frontmatterLineOffset = 0;
  let getConfig: (() => MermaidConfig) | undefined;
  let logger: ArchiMateLogger | undefined;

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
        return model?.title ?? diagramTitle ?? '';
      },
      getAccTitle() {
        return model?.accTitle ?? model?.title ?? diagramTitle ?? '';
      },
      getAccDescription() {
        return model?.accDescription ?? '';
      },
    },
    parser: {
      parse(source) {
        model = undefined;
        // Mermaid encodes #name; and #123; before dispatch. Quoted ArchiMate
        // text treats these sequences literally, so restore them before parsing.
        const literalSource = source.replace(mermaidEntityMarker, '#$1;');
        model = parseArchiMate(literalSource, { lineOffset: frontmatterLineOffset });
      },
    },
    renderer: {
      async draw(_text, id, _version, diagram) {
        if (!model) {
          throw new Error('Parse an ArchiMate diagram before rendering it.');
        }

        await renderArchiMate(model, id, diagram.db.getDiagramTitle?.() ?? '', options, getConfig?.(), logger);
      },
    },
    styles: archimateStyles,
    injectUtils(log: unknown, _setLogLevel, readConfig: () => MermaidConfig) {
      logger = toLogger(log);
      getConfig = readConfig;
    },
  };
}
