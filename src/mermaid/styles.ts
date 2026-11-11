import type { MermaidConfig } from "mermaid";
import { relationshipStroke, type ElementCategory } from "../archimate/catalogue.js";

interface ElementColours {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
}

const modernTechnologyColours = { fill: "#d6f8b8", stroke: "#8bd34c", text: "#2f5909" };

// The four pictured families use colours sampled from the reference image.
// The remaining families retain their Archi fills with matching darker tones.
const modernElementColours = {
  motivation: { fill: "#d9cfff", stroke: "#7b62db", text: "#4026a5" },
  strategy: { fill: "#f5deaa", stroke: "#bc904c", text: "#654617" },
  business: { fill: "#faf087", stroke: "#d7c828", text: "#574f04" },
  application: { fill: "#b8e7fc", stroke: "#52b0d9", text: "#054c6c" },
  technology: modernTechnologyColours,
  physical: modernTechnologyColours,
  implementationAndMigration: { fill: "#ffe0e0", stroke: "#ce8992", text: "#783d46" },
  composite: { fill: "#ffffff", stroke: "#9ba5b0", text: "#475666" },
} satisfies Record<ElementCategory, ElementColours>;

export interface PaletteColours {
  readonly elements: Readonly<Record<ElementCategory, ElementColours>>;
  readonly location: ElementColours;
  readonly note: ElementColours & { readonly fold: string };
}

export const archimatePalettes = {
  modern: {
    elements: modernElementColours,
    location: { fill: "#edcfe2", stroke: "#bd84a9", text: "#704663" },
    note: { fill: "#fff8cb", fold: "#f5e9a5", stroke: "#9b8736", text: "#000000" },
  },
} satisfies Record<string, PaletteColours>;

export type ArchiMatePalette = keyof typeof archimatePalettes;

export interface DiagramColours {
  readonly canvas: string;
  readonly text: string;
  readonly relationship: string;
  readonly relationshipOutline?: string;
}

const lightColours: DiagramColours = {
  canvas: "#ffffff", text: "#1b1b1b", relationship: relationshipStroke,
};

const darkColours: DiagramColours = {
  canvas: "#333", text: "#ffffff", relationship: "#ffffff", relationshipOutline: "#333",
};

const darkThemes = new Set<MermaidConfig["theme"]>(["dark", "neo-dark", "redux-dark", "redux-dark-color"]);

export function resolveDiagramColours(config?: MermaidConfig): DiagramColours {
  const variables: unknown = config?.themeVariables;
  const darkMode = typeof variables === "object" && variables !== null
    && "darkMode" in variables && variables.darkMode === true;
  return darkMode || darkThemes.has(config?.theme) ? darkColours : lightColours;
}

export const archimateStyles = () => `
  .archimate-label {
    font-family: var(--mermaid-font-family, Arial, sans-serif);
    font-size: 14px;
  }

  .archimate-title {
    font-size: 17px;
    font-weight: 600;
  }

  .archimate-edge-label {
    font-size: 12px;
  }
`;
