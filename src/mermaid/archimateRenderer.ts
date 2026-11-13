import type { MermaidConfig } from 'mermaid';
import type { ArchiMateModel } from '../archimate/model.js';
import type { ArchiMatePluginOptions } from './archimateDetector.js';
import type { ArchiMateLogger } from './archimateDiagram.js';
import { drawDiagram } from './render/draw.js';
import { buildLayoutGraph } from './render/graph.js';
import { placeLabels } from './render/labels.js';
import { layoutDiagram } from './render/layout.js';
import { measureDiagram } from './render/measure.js';
import { placeDiagram } from './render/place.js';
import { routeDiagram } from './render/route.js';
import { usesArchitectureLayout } from './render/shared.js';
import { browserColour, getSvg } from './render/svg.js';
import { applyViewport, computeViewport } from './render/viewport.js';
import { archimatePalettes, resolveDiagramColours, resolveTypography } from './styles.js';

export { resolveElkConstructor } from './render/layout.js';

export async function renderArchiMate(
  model: ArchiMateModel,
  id: string,
  title: string,
  options: Required<ArchiMatePluginOptions>,
  config?: MermaidConfig,
  logger?: ArchiMateLogger,
): Promise<void> {
  const svg = getSvg(id, config);
  const colours = resolveDiagramColours(
    config,
    (colour) => browserColour(svg, colour),
    logger &&
      ((message) => {
        logger.warn(message);
      }),
  );
  const typography = resolveTypography(config?.theme, config?.themeVariables);
  const parents = new Map(model.nesting?.map(({ child, parent }) => [child, parent]));
  const measured = measureDiagram(svg, model, title, typography);
  const graph = buildLayoutGraph(model, measured, parents);
  const layout = await layoutDiagram(model, graph, options.maxRowWidth);
  const placement = placeDiagram(model, layout.root, graph);
  const routed = routeDiagram({ model, graph, layout, placement, parents, logger });
  const edges = placeLabels(routed, placement, usesArchitectureLayout(model));
  const viewport = computeViewport(layout, edges, measured.title, options.diagramPadding);
  drawDiagram(svg, {
    id,
    viewport,
    placement,
    edges,
    title: measured.title,
    palette: archimatePalettes[options.palette],
    colours,
    background: options.background,
  });
  applyViewport(svg, viewport, options.useMaxWidth);
}
