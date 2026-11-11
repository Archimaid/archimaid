import type { ElementCategory } from "../archimate/catalogue.js";

interface ElementColours {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
}

const technologyColours = { fill: "#d6f8b8", stroke: "#8bd34c", text: "#2f5909" };

// The four pictured families use colours sampled from the reference image.
// The remaining families retain their Archi fills with matching darker tones.
export const elementColours = {
  motivation: { fill: "#d9cfff", stroke: "#7b62db", text: "#4026a5" },
  strategy: { fill: "#f5deaa", stroke: "#bc904c", text: "#654617" },
  business: { fill: "#faf087", stroke: "#d7c828", text: "#574f04" },
  application: { fill: "#b8e7fc", stroke: "#52b0d9", text: "#054c6c" },
  technology: technologyColours,
  physical: technologyColours,
  implementationAndMigration: { fill: "#ffe0e0", stroke: "#ce8992", text: "#783d46" },
  composite: { fill: "#ffffff", stroke: "#9ba5b0", text: "#475666" },
} satisfies Record<ElementCategory, ElementColours>;

export const locationColours = { fill: "#edcfe2", stroke: "#bd84a9", text: "#704663" };

export const noteColours = { fill: "#fff8cb", fold: "#f5e9a5", stroke: "#9b8736", text: "#000000" };

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
