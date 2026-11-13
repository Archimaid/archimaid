import type { ELK, ElkNode } from "elkjs/lib/elk.bundled.js";
import type { ArchiMateModel } from "../../archimate/model.js";
import { placeArchitecture } from "../architectureLayout.js";
import type { LayoutGraph } from "./graph.js";
import { layoutPadding, usesArchitectureLayout } from "./shared.js";

const architectureRows = ["strategy", "business", "application", "technology", "implementationAndMigration"];
type ElkConstructor = new () => ELK;

function isElkConstructor(value: unknown): value is ElkConstructor {
  return typeof value === "function";
}

function property(value: unknown, name: string): unknown {
  return (typeof value === "object" || typeof value === "function") && value !== null
    ? Reflect.get(value, name)
    : undefined;
}

// ELK ships a CommonJS bundle that marks itself as an ES module. Depending on the bundler, the default
// import is the constructor itself or module.exports with the constructor on its default property.
export function resolveElkConstructor(loaded: unknown): ElkConstructor {
  const constructor = [loaded, property(loaded, "default"), property(property(loaded, "default"), "default")]
    .find(isElkConstructor);
  if (!constructor) {
    throw new Error("The elkjs module did not provide its layout constructor.");
  }
  return constructor;
}

let elkInstance: Promise<ELK> | undefined;

// Only graph layout needs ELK, so the 1.5 MB bundle loads on first use.
function loadElk(): Promise<ELK> {
  elkInstance ??= import("elkjs/lib/elk.bundled.js")
    .then((loaded) => new (resolveElkConstructor(loaded))())
    .catch((error: unknown) => {
      elkInstance = undefined;
      throw error;
    });
  return elkInstance;
}

export interface DiagramLayout {
  readonly root: ElkNode;
  readonly width: number;
  readonly height: number;
}

export async function layoutDiagram(
  model: ArchiMateModel, { input, nodes, edges }: LayoutGraph, maxRowWidth: number,
): Promise<DiagramLayout> {
  const root: ElkNode = usesArchitectureLayout(model)
    ? { ...input, ...placeArchitecture(
      input.children,
      new Map(Array.from(nodes, ([key, { type, headerHeight, notesHeight }]) => [key, {
        row: type.category === "composite" ? null : type.category === "physical" ? "technology" : type.category,
        column: type.aspect === "motivation" ? null : type.aspect,
        headerHeight: headerHeight + notesHeight,
      }])),
      input.edges.flatMap(({ id: edgeId, sources: [source], targets: [target] }) => {
        const type = edges.get(edgeId)?.relationship.type;
        return source && target && type ? [{ source, target, type }] : [];
      }),
      {
        rowOrder: architectureRows,
        padding: layoutPadding,
        labelHeight: Array.from(edges.values()).reduce((height, edge) => Math.max(height, edge.label?.height ?? 0), 0),
        framework: model.layout === "framework",
        maxRowWidth,
      },
    ) }
    : await (await loadElk()).layout(input);
  if (root.width === undefined || root.height === undefined) {
    throw new Error("ELK did not return the ArchiMate diagram size.");
  }
  return { root, width: root.width, height: root.height };
}
