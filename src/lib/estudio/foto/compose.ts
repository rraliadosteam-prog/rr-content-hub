import { colorFilter, filterCss } from "@/lib/estudio/types";
import { adjustmentColor, PhotoProject } from "@/lib/estudio/foto/model";
import { applyPerPixelAdjustments } from "@/lib/estudio/foto/imageops";

export interface SourceEntry {
  el: CanvasImageSource;
  width: number;
  height: number;
}

export type SourceMap = Map<string, SourceEntry>;

let workCanvas: HTMLCanvasElement | null = null;

/** Dibuja el proyecto completo (capas + filtros + ajustes) en un lienzo destino. */
export function compose(
  target: HTMLCanvasElement,
  project: PhotoProject,
  sources: SourceMap,
  scale = 1,
): void {
  const ctx = target.getContext("2d");
  if (!ctx) return;

  const w = Math.max(1, Math.round(project.width * scale));
  const h = Math.max(1, Math.round(project.height * scale));
  if (!workCanvas) workCanvas = document.createElement("canvas");
  if (workCanvas.width !== w || workCanvas.height !== h) {
    workCanvas.width = w;
    workCanvas.height = h;
  }
  const wctx = workCanvas.getContext("2d");
  if (!wctx) return;
  wctx.setTransform(1, 0, 0, 1, 0, 0);
  wctx.clearRect(0, 0, w, h);
  wctx.scale(scale, scale);
  wctx.fillStyle = project.background || "#070001";
  wctx.fillRect(0, 0, project.width, project.height);

  for (const layer of project.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    wctx.save();
    wctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
    wctx.globalCompositeOperation =
      layer.blend === "normal" ? "source-over" : (layer.blend as GlobalCompositeOperation);
    const cx = project.width / 2 + layer.x;
    const cy = project.height / 2 + layer.y;
    wctx.translate(cx, cy);
    if (layer.rotation) wctx.rotate((layer.rotation * Math.PI) / 180);
    if (layer.flipH) wctx.scale(-1, 1);

    if (layer.type === "image") {
      const src = sources.get(layer.srcId ?? "");
      if (src) {
        const dw = src.width * layer.scale;
        const dh = src.height * layer.scale;
        wctx.drawImage(src.el, -dw / 2, -dh / 2, dw, dh);
      }
    } else {
      const size = Math.max(6, (layer.fontSize ?? 64) * layer.scale);
      wctx.font = `${layer.fontWeight ?? 700} ${size}px "${layer.fontFamily ?? "Lexend"}", system-ui, sans-serif`;
      wctx.textAlign = layer.align ?? "center";
      wctx.textBaseline = "middle";
      if (layer.shadow) {
        wctx.shadowColor = "rgba(7,0,1,0.65)";
        wctx.shadowBlur = size * 0.22;
        wctx.shadowOffsetY = size * 0.05;
      }
      const text = layer.text ?? "";
      if (layer.strokeWidth && layer.strokeColor && layer.strokeColor !== "transparent") {
        wctx.lineJoin = "round";
        wctx.lineWidth = layer.strokeWidth;
        wctx.strokeStyle = layer.strokeColor;
        wctx.strokeText(text, 0, 0);
      }
      wctx.fillStyle = layer.fontColor ?? "#fffff3";
      wctx.fillText(text, 0, 0);
    }
    wctx.restore();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const filters = [filterCss(project.filterId), colorFilter(adjustmentColor(project.adjustments))]
    .filter((f) => f && f !== "none")
    .join(" ");
  ctx.filter = filters || "none";
  ctx.drawImage(workCanvas, 0, 0, w, h);
  ctx.filter = "none";

  const img = ctx.getImageData(0, 0, w, h);
  applyPerPixelAdjustments(img, project.adjustments);
  ctx.putImageData(img, 0, 0);
}

/** Lee el color de un punto de una capa (para el selector de color). */
export function readPixel(
  source: SourceEntry,
  docX: number,
  docY: number,
  layerX: number,
  layerY: number,
  layerScale: number,
  docWidth: number,
  docHeight: number,
): { r: number; g: number; b: number } {
  const cx = docWidth / 2 + layerX;
  const cy = docHeight / 2 + layerY;
  const sx = Math.round((docX - cx) / layerScale + source.width / 2);
  const sy = Math.round((docY - cy) / layerScale + source.height / 2);
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { r: 0, g: 0, b: 0 };
  const px = Math.max(0, Math.min(source.width - 1, sx));
  const py = Math.max(0, Math.min(source.height - 1, sy));
  ctx.drawImage(source.el, px, py, 1, 1, 0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return { r: data[0], g: data[1], b: data[2] };
}
