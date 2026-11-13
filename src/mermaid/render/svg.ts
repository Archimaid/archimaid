import type { MermaidConfig } from "mermaid";

export const svgNamespace = "http://www.w3.org/2000/svg";

export type SvgAttributes = Record<string, string | number>;

export function append<Tag extends keyof SVGElementTagNameMap>(
  parent: SVGElement,
  tag: Tag,
  attrs: SvgAttributes = {},
): SVGElementTagNameMap[Tag] {
  const element = parent.ownerDocument.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, String(value));
  }
  parent.append(element);
  return element;
}

// Lets the browser normalise any CSS colour, such as a named colour, to rgb() or rgba().
export function browserColour(svg: SVGSVGElement, colour: string): string | undefined {
  const view = svg.ownerDocument.defaultView;
  if (!view) return undefined;
  const probe = append(svg, "g", { visibility: "hidden" });
  try {
    probe.style.color = colour;
    return probe.style.color ? view.getComputedStyle(probe).color : undefined;
  } finally {
    probe.remove();
  }
}

export function getSvg(id: string, config: MermaidConfig | undefined): SVGSVGElement {
  const frame = config?.securityLevel === "sandbox" ? document.getElementById(`i${id}`) : null;
  const targetDocument = frame instanceof HTMLIFrameElement ? frame.contentDocument : document;
  const svg = targetDocument?.querySelector<SVGSVGElement>(`svg#${CSS.escape(id)}`);
  if (svg?.namespaceURI !== svgNamespace) {
    throw new Error("Mermaid did not create the ArchiMate SVG container.");
  }
  return svg;
}
