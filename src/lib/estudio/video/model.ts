import { ColorAdjust, DEFAULT_COLOR } from "@/lib/estudio/types";

export type ClipKind = "video" | "audio";
export type TransitionType = "ninguna" | "cruzado" | "fundido" | "deslizar" | "zoom" | "cortina";
export type DemoStyle = "aurora" | "barras" | "particulas" | "ondas" | "creditos";

export interface TransitionOption {
  id: TransitionType;
  name: string;
}

export const TRANSITIONS: TransitionOption[] = [
  { id: "ninguna", name: "Sin transición" },
  { id: "cruzado", name: "Cruzado" },
  { id: "fundido", name: "Fundido a negro" },
  { id: "deslizar", name: "Deslizar" },
  { id: "zoom", name: "Zoom" },
  { id: "cortina", name: "Cortina" },
];

export interface Track {
  id: string;
  name: string;
  kind: ClipKind;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export interface Clip {
  id: string;
  kind: ClipKind;
  name: string;
  sourceId: string;
  isDemo: boolean;
  demoStyle?: DemoStyle;
  trackId: string;
  start: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  volume: number;
  muted: boolean;
  filterId: string;
  color: ColorAdjust;
  opacity: number;
  transitionIn: TransitionType;
  transitionDuration: number;
  fadeOut: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}

export interface TextLayer {
  id: string;
  name: string;
  content: string;
  start: number;
  duration: number;
  fontFamily: "Inter Tight" | "Lexend";
  fontSize: number; // porcentaje del alto del lienzo
  weight: number;
  color: string;
  background: string;
  align: "left" | "center" | "right";
  x: number; // 0..1
  y: number; // 0..1
  uppercase: boolean;
  shadow: boolean;
  stroke: string;
  strokeWidth: number;
  subtitle: boolean;
}

export interface VideoProject {
  aspect: "9:16" | "1:1" | "4:5" | "16:9";
  fps: number;
  duration: number;
  background: string;
  tracks: Track[];
  clips: Clip[];
  texts: TextLayer[];
}

export function clipDuration(clip: Clip): number {
  return Math.max(0.04, (clip.outPoint - clip.inPoint) / Math.max(0.05, clip.speed));
}

export function clipEnd(clip: Clip): number {
  return clip.start + clipDuration(clip);
}

export function sourceTimeAt(clip: Clip, time: number): number {
  return clip.inPoint + (time - clip.start) * clip.speed;
}

export function clipIsActive(clip: Clip, time: number): boolean {
  return time >= clip.start && time < clipEnd(clip);
}

export function makeClip(partial: Partial<Clip> & { id: string; name: string; trackId: string }): Clip {
  return {
    kind: "video",
    sourceId: "",
    isDemo: false,
    start: 0,
    inPoint: 0,
    outPoint: 4,
    speed: 1,
    volume: 1,
    muted: false,
    filterId: "original",
    color: { ...DEFAULT_COLOR },
    opacity: 1,
    transitionIn: "cruzado",
    transitionDuration: 0.5,
    fadeOut: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    ...partial,
  };
}

export function makeText(partial: Partial<TextLayer> & { id: string }): TextLayer {
  return {
    name: "Texto",
    content: "Escribe aquí",
    start: 0,
    duration: 3,
    fontFamily: "Lexend",
    fontSize: 8,
    weight: 700,
    color: "#fffff3",
    background: "transparent",
    align: "center",
    x: 0.5,
    y: 0.5,
    uppercase: false,
    shadow: true,
    stroke: "transparent",
    strokeWidth: 0,
    subtitle: false,
    ...partial,
  };
}

export function defaultProject(): VideoProject {
  return {
    aspect: "9:16",
    fps: 30,
    duration: 16,
    background: "#070001",
    tracks: [
      { id: "v3", name: "V3", kind: "video", muted: false, hidden: false, locked: false },
      { id: "v2", name: "V2", kind: "video", muted: false, hidden: false, locked: false },
      { id: "v1", name: "V1", kind: "video", muted: false, hidden: false, locked: false },
      { id: "a1", name: "A1", kind: "audio", muted: false, hidden: false, locked: false },
    ],
    clips: [],
    texts: [],
  };
}
