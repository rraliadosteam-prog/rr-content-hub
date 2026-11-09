import { ColorAdjust, DEFAULT_COLOR } from "@/lib/estudio/types";

export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "lighten" | "darken";
export type LayerType = "image" | "text";

export interface PhotoLayer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipH: boolean;
  srcId?: string;
  naturalWidth: number;
  naturalHeight: number;
  text?: string;
  fontFamily?: "Inter Tight" | "Lexend";
  fontSize?: number;
  fontWeight?: number;
  fontColor?: string;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  strokeColor?: string;
  strokeWidth?: number;
  shadow?: boolean;
}

export interface PhotoAdjustments {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  vibrance: number;
  fade: number;
  grain: number;
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  vibrance: 0,
  fade: 0,
  grain: 0,
};

export interface PhotoProject {
  width: number;
  height: number;
  background: string;
  layers: PhotoLayer[];
  adjustments: PhotoAdjustments;
  filterId: string;
}

export function makeImageLayer(partial: Partial<PhotoLayer> & { id: string; name: string }): PhotoLayer {
  return {
    type: "image",
    visible: true,
    opacity: 1,
    blend: "normal",
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipH: false,
    naturalWidth: 0,
    naturalHeight: 0,
    ...partial,
  };
}

export function makeTextLayer(partial: Partial<PhotoLayer> & { id: string; name: string }): PhotoLayer {
  return {
    type: "text",
    visible: true,
    opacity: 1,
    blend: "normal",
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipH: false,
    naturalWidth: 0,
    naturalHeight: 0,
    text: "Texto RR",
    fontFamily: "Lexend",
    fontSize: 64,
    fontWeight: 700,
    fontColor: "#fffff3",
    align: "center",
    letterSpacing: 0,
    strokeColor: "transparent",
    strokeWidth: 0,
    shadow: true,
    ...partial,
  };
}

/** Copia superficial del proyecto: las máscaras y las imágenes se comparten entre copias. */
export function cloneProject(project: PhotoProject): PhotoProject {
  return {
    ...project,
    adjustments: { ...project.adjustments },
    layers: project.layers.map((l) => ({ ...l })),
  };
}

export function adjustmentColor(adj: PhotoAdjustments): ColorAdjust {
  return {
    exposure: adj.exposure,
    contrast: adj.contrast,
    saturation: adj.saturation,
    temperature: adj.temperature,
    tint: adj.tint,
  };
}
