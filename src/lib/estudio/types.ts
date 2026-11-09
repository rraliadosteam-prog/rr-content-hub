// Tipos compartidos del prototipo RR Estudio.

export type AspectKey = "9:16" | "1:1" | "4:5" | "16:9";

export interface AspectPreset {
  key: AspectKey;
  label: string;
  hint: string;
  w: number;
  h: number;
}

export const ASPECTS: Record<AspectKey, AspectPreset> = {
  "9:16": { key: "9:16", label: "Vertical 9:16", hint: "Reels, TikTok y Shorts", w: 1080, h: 1920 },
  "1:1": { key: "1:1", label: "Cuadrado 1:1", hint: "Feed cuadrado", w: 1080, h: 1080 },
  "4:5": { key: "4:5", label: "Feed 4:5", hint: "Instagram vertical", w: 1080, h: 1350 },
  "16:9": { key: "16:9", label: "Horizontal 16:9", hint: "YouTube y web", w: 1920, h: 1080 },
};

export const ASPECT_ORDER: AspectKey[] = ["9:16", "1:1", "4:5", "16:9"];

/** Ajustes de color de un clip o de la foto completa. */
export interface ColorAdjust {
  exposure: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  temperature: number; // -100 (frío) .. 100 (cálido)
  tint: number; // -100 (verde) .. 100 (magenta)
}

export const DEFAULT_COLOR: ColorAdjust = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
};

export interface FilterPreset {
  id: string;
  name: string;
  /** Filtro equivalente en CSS/canvas (se usa en ctx.filter). */
  css: string;
  /** Degradado de muestra para las tarjetas de la interfaz. */
  swatch: string;
}

export const FILTERS: FilterPreset[] = [
  { id: "original", name: "Original", css: "none", swatch: "linear-gradient(135deg,#3d1b36,#8a2f6b)" },
  { id: "rr", name: "RR Fucsia", css: "saturate(1.4) hue-rotate(-12deg) contrast(1.1)", swatch: "linear-gradient(135deg,#be076d,#973d8f)" },
  { id: "mostaza", name: "Mostaza", css: "sepia(0.35) saturate(1.55) contrast(1.06)", swatch: "linear-gradient(135deg,#ded116,#8a7a10)" },
  { id: "orquidea", name: "Orquídea", css: "saturate(1.25) hue-rotate(300deg) contrast(1.08)", swatch: "linear-gradient(135deg,#973d8f,#4a1d47)" },
  { id: "bw", name: "Blanco y negro", css: "grayscale(1) contrast(1.15)", swatch: "linear-gradient(135deg,#f4f4f4,#3a3a3a)" },
  { id: "cine", name: "Cine", css: "contrast(1.22) saturate(0.82) brightness(0.95)", swatch: "linear-gradient(135deg,#2b3f52,#c9794a)" },
  { id: "calido", name: "Cálido", css: "sepia(0.25) saturate(1.25) brightness(1.05)", swatch: "linear-gradient(135deg,#ffb35c,#c2551f)" },
  { id: "frio", name: "Frío", css: "sepia(0.22) hue-rotate(175deg) saturate(1.1)", swatch: "linear-gradient(135deg,#6fc6e8,#2b4f8a)" },
  { id: "vintage", name: "Vintage", css: "sepia(0.45) contrast(0.95) saturate(1.1)", swatch: "linear-gradient(135deg,#d9c39a,#7c6a4f)" },
  { id: "contraste", name: "Alto contraste", css: "contrast(1.5) saturate(1.15)", swatch: "linear-gradient(135deg,#ffffff,#000000)" },
  { id: "suave", name: "Suave", css: "brightness(1.07) saturate(0.92) contrast(0.95)", swatch: "linear-gradient(135deg,#ffe9f3,#cbb6c6)" },
  { id: "invertido", name: "Invertido", css: "invert(1) hue-rotate(180deg)", swatch: "linear-gradient(135deg,#00d3a7,#be076d)" },
];

export const FILTERS_BY_ID: Record<string, FilterPreset> = Object.fromEntries(
  FILTERS.map((f) => [f.id, f]),
);

export function filterCss(id: string): string {
  return FILTERS_BY_ID[id]?.css ?? "none";
}

/** Convierte los ajustes de color en una cadena de filtro de canvas. */
export function colorFilter(c: ColorAdjust): string {
  const parts: string[] = [];
  const exposure = 1 + (c.exposure / 100) * 0.9;
  if (Math.abs(c.exposure) > 0.5) parts.push(`brightness(${exposure.toFixed(3)})`);
  const contrast = 1 + (c.contrast / 100) * 0.8;
  if (Math.abs(c.contrast) > 0.5) parts.push(`contrast(${contrast.toFixed(3)})`);
  const saturation = 1 + (c.saturation / 100) * 1.2;
  if (Math.abs(c.saturation) > 0.5) parts.push(`saturate(${saturation.toFixed(3)})`);
  if (Math.abs(c.temperature) > 0.5) {
    const warm = Math.abs(c.temperature) / 100;
    parts.push(`sepia(${(warm * 0.45).toFixed(3)})`);
    if (c.temperature < 0) parts.push(`hue-rotate(175deg)`);
  }
  if (Math.abs(c.tint) > 0.5) {
    const tint = c.tint / 100;
    parts.push(tint > 0 ? `sepia(${(tint * 0.3).toFixed(3)})` : `hue-rotate(200deg)`);
  }
  return parts.length ? parts.join(" ") : "none";
}
