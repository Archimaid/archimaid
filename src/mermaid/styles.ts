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

const darkThemes = new Set<unknown>(["dark", "neo-dark", "redux-dark", "redux-dark-color"]);
const defaultFontSize = 14;
const defaultFontFamily = "var(--mermaid-font-family, Arial, sans-serif)";

export interface DiagramTypography {
  readonly fontFamily: string;
  readonly labelSize: number;
  readonly titleSize: number;
  readonly edgeLabelSize: number;
}

function variable(variables: unknown, name: string): string | undefined {
  if (typeof variables !== "object" || variables === null || !(name in variables)) return undefined;
  const value: unknown = Reflect.get(variables, name);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const minimumFontSize = 8;
const maximumFontSize = 32;

// The font family is written into a style sheet, so accept only plain family names and balanced quotes.
function fontFamilyValue(value: string | undefined): string | undefined {
  const name = "[\\p{L}\\d ,_-]";
  return value !== undefined && new RegExp(`^(?:${name}|"${name}*"|'${name}*')+$`, "u").test(value) ? value : undefined;
}

type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

// Reads a colour that a browser has resolved, for formats this module does not parse itself.
export type ColourResolver = (colour: string) => string | undefined;

function alphaValue(value: string | undefined): number {
  if (value === undefined) return 1;
  return value.endsWith("%") ? Number.parseFloat(value) / 100 : Number(value);
}

function channels(colour: string): Rgba | undefined {
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu.exec(colour)?.[1];
  if (hex) {
    const digits = hex.length <= 4 ? Array.from(hex, (digit) => digit + digit) : hex.match(/../gu) ?? [];
    const [red = 0, green = 0, blue = 0, alpha = 255] = digits.map((pair) => Number.parseInt(pair, 16));
    return [red, green, blue, alpha / 255];
  }
  const separator = "\\s*[\\s,]\\s*";
  const alpha = "(?:\\s*[,/]\\s*([\\d.]+%?))?";
  const rgb = new RegExp(`^rgba?\\(\\s*([\\d.]+)${separator}([\\d.]+)${separator}([\\d.]+)${alpha}\\s*\\)$`, "iu")
    .exec(colour);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alphaValue(rgb[4])];
  const hsl = new RegExp(
    `^hsla?\\(\\s*([\\d.]+)(?:deg)?${separator}([\\d.]+)%${separator}([\\d.]+)%${alpha}\\s*\\)$`, "iu",
  ).exec(colour);
  if (hsl) {
    const hue = Number(hsl[1]) % 360;
    const saturation = Number(hsl[2]) / 100;
    const lightness = Number(hsl[3]) / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const channel = (offset: number) => {
      const k = (offset + hue / 30) % 12;
      return 255 * (lightness - chroma / 2 * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return [channel(0), channel(8), channel(4), alphaValue(hsl[4])];
  }
  const named: Record<string, Rgba> = {
    white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0],
  };
  return named[colour.toLowerCase()];
}

function parseColour(colour: string, resolve: ColourResolver | undefined): Rgba | undefined {
  const parsed = channels(colour);
  if (parsed) return parsed;
  const resolved = resolve?.(colour);
  return resolved === undefined ? undefined : channels(resolved);
}

function isDark([red, green, blue]: Rgba): boolean {
  const [r, g, b] = [red, green, blue].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  // Below this relative luminance, white text has more contrast than black text.
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0) < 0.179;
}

function declaredDarkMode(variables: unknown): boolean | undefined {
  const declared: unknown = typeof variables === "object" && variables !== null && "darkMode" in variables
    ? variables.darkMode
    : undefined;
  return typeof declared === "boolean" ? declared : undefined;
}

// Mermaid only supports customising theme variables on its base theme. The named themes keep the
// ArchiMate presets, so their diagrams look the same as before theme variables were read.
export function resolveDiagramColours(config?: MermaidConfig, resolve?: ColourResolver): DiagramColours {
  const variables: unknown = config?.themeVariables;
  const declared = declaredDarkMode(variables);
  const background = variable(variables, "background");
  const parsed = background === undefined ? undefined : parseColour(background, resolve);
  // Label backings and hollow markers are painted in the canvas colour, so it must be opaque and known.
  const opaque = parsed !== undefined && parsed[3] >= 1 ? parsed : undefined;
  const dark = declared ?? (opaque ? isDark(opaque) : darkThemes.has(config?.theme));
  const preset = dark ? darkColours : lightColours;
  if (config?.theme !== "base" || background === undefined || !opaque) return preset;
  // The base theme derives textColor from primaryColor, so it can match a custom dark background.
  const legible = (colour: string | undefined) => {
    const ink = colour === undefined ? undefined : parseColour(colour, resolve);
    return ink && ink[3] > 0 && isDark(ink) !== dark ? colour : undefined;
  };
  return {
    canvas: background,
    text: legible(variable(variables, "textColor")) ?? preset.text,
    relationship: legible(variable(variables, "lineColor")) ?? preset.relationship,
    ...(dark ? { relationshipOutline: background } : {}),
  };
}

export function resolveTypography(theme: unknown, variables: unknown): DiagramTypography {
  const size = theme === "base" ? Number.parseFloat(variable(variables, "fontSize") ?? "") : Number.NaN;
  const labelSize = Number.isFinite(size) && size > 0
    ? Math.min(Math.max(size, minimumFontSize), maximumFontSize)
    : defaultFontSize;
  return {
    fontFamily: (theme === "base" ? fontFamilyValue(variable(variables, "fontFamily")) : undefined)
      ?? defaultFontFamily,
    labelSize,
    titleSize: Math.round(labelSize * 17 / 14),
    edgeLabelSize: Math.round(labelSize * 12 / 14),
  };
}

export const archimateStyles = (options?: unknown): string => {
  const theme = typeof options === "object" && options !== null && "theme" in options ? options.theme : undefined;
  const { fontFamily, labelSize, titleSize, edgeLabelSize } = resolveTypography(theme, options);
  return `
  .archimate-label {
    font-family: ${fontFamily};
    font-size: ${labelSize}px;
  }

  .archimate-title {
    font-size: ${titleSize}px;
    font-weight: 600;
  }

  .archimate-edge-label {
    font-size: ${edgeLabelSize}px;
  }
`;
};
