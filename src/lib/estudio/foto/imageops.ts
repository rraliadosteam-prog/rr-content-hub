import { PhotoAdjustments } from "@/lib/estudio/foto/model";

/** Distancia de color ponderada (estilo Photoshop). */
function colorDistance(dr: number, dg: number, db: number): number {
  return Math.sqrt((2 * dr * dr + 4 * dg * dg + 3 * db * db) / 9);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Ajustes que necesitan trabajar pixel a pixel (temperatura, luces, sombras…). */
export function applyPerPixelAdjustments(data: ImageData, adj: PhotoAdjustments): ImageData {
  const px = data.data;
  const temp = adj.temperature / 100;
  const tint = adj.tint / 100;
  const hi = adj.highlights / 100;
  const sh = adj.shadows / 100;
  const vib = adj.vibrance / 100;
  const fade = adj.fade / 100;
  const grain = adj.grain / 100;

  for (let i = 0; i < px.length; i += 4) {
    let r = px[i];
    let g = px[i + 1];
    let b = px[i + 2];

    if (temp !== 0) {
      r += temp * 38;
      b -= temp * 38;
      g += temp * 6;
    }
    if (tint !== 0) {
      if (tint > 0) {
        r += tint * 22;
        b += tint * 22;
        g -= tint * 26;
      } else {
        g += -tint * 34;
        r -= -tint * 14;
        b -= -tint * 14;
      }
    }

    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (hi !== 0) {
      const w = smoothstep(0.45, 1, lum) * hi * 60;
      r += w;
      g += w;
      b += w;
    }
    if (sh !== 0) {
      const w = (1 - smoothstep(0, 0.55, lum)) * sh * 60;
      r += w;
      g += w;
      b += w;
    }
    if (vib !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(-1, Math.min(1, (Math.max(r, g, b) - Math.min(r, g, b)) / 255));
      const amount = vib * 70 * (1 - sat);
      r = gray + (r - gray) * (1 + amount / 100);
      g = gray + (g - gray) * (1 + amount / 100);
      b = gray + (b - gray) * (1 + amount / 100);
    }
    if (fade !== 0) {
      r = r + (255 - r) * fade * 0.22;
      g = g + (255 - g) * fade * 0.22;
      b = b + (255 - b) * fade * 0.22;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * (1 - fade * 0.18);
      g = gray + (g - gray) * (1 - fade * 0.18);
      b = gray + (b - gray) * (1 - fade * 0.18);
    }
    if (grain !== 0) {
      const n = (Math.random() - 0.5) * grain * 46;
      r += n;
      g += n;
      b += n;
    }

    px[i] = Math.max(0, Math.min(255, r));
    px[i + 1] = Math.max(0, Math.min(255, g));
    px[i + 2] = Math.max(0, Math.min(255, b));
  }
  return data;
}

/** Quita el fondo por color (croma): borra los pixeles parecidos al color elegido. */
export function removeBackgroundByColor(
  data: ImageData,
  color: { r: number; g: number; b: number },
  tolerance: number,
  softness: number,
): ImageData {
  const px = data.data;
  const tol = Math.max(1, tolerance);
  const soft = Math.max(0, softness);
  for (let i = 0; i < px.length; i += 4) {
    const d = colorDistance(px[i] - color.r, px[i + 1] - color.g, px[i + 2] - color.b);
    if (d <= tol) {
      px[i + 3] = 0;
    } else if (soft > 0 && d <= tol + soft) {
      const alpha = ((d - tol) / soft) * px[i + 3];
      px[i + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
    }
  }
  return data;
}

/** Relleno por inundación: marca la región contigua de un color parecido al punto tocado. */
export function floodFillMask(
  data: ImageData,
  startX: number,
  startY: number,
  tolerance: number,
): Uint8ClampedArray {
  const { width, height, data: px } = data;
  const mask = new Uint8ClampedArray(width * height);
  const sx = Math.max(0, Math.min(width - 1, Math.round(startX)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(startY)));
  const seed = (sy * width + sx) * 4;
  const sr = px[seed];
  const sg = px[seed + 1];
  const sb = px[seed + 2];
  const tol = Math.max(1, tolerance);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];

  while (stack.length) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const p = idx * 4;
    if (px[p + 3] === 0) continue;
    const d = colorDistance(px[p] - sr, px[p + 1] - sg, px[p + 2] - sb);
    if (d > tol) continue;
    mask[idx] = 255;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return mask;
}

/** Suaviza una máscara (difuminado de caja) para que el recorte no tenga bordes duros. */
export function blurMask(mask: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  if (radius <= 0) return mask;
  const out = new Uint8ClampedArray(mask.length);
  const r = Math.round(radius);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += mask[yy * width + xx];
          count++;
        }
      }
      out[y * width + x] = Math.round(sum / Math.max(1, count));
    }
  }
  return out;
}

/** Aplica la máscara como canal alfa. */
export function applyMask(data: ImageData, mask: Uint8ClampedArray, invert: boolean): ImageData {
  const px = data.data;
  for (let i = 0, m = 0; i < px.length; i += 4, m++) {
    const v = invert ? 255 - mask[m] : mask[m];
    px[i + 3] = Math.round((px[i + 3] * v) / 255);
  }
  return data;
}

/** Estima el color del fondo mirando el borde de la imagen. */
export function estimateBorderColor(data: ImageData): { r: number; g: number; b: number } {
  const { width, height, data: px } = data;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const stepX = Math.max(1, Math.floor(width / 40));
  const stepY = Math.max(1, Math.floor(height / 40));
  const sample = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    rs.push(px[p]);
    gs.push(px[p + 1]);
    bs.push(px[p + 2]);
  };
  for (let x = 0; x < width; x += stepX) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    sample(0, y);
    sample(width - 1, y);
  }
  const median = (arr: number[]) => {
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)] ?? 0;
  };
  return { r: median(rs), g: median(gs), b: median(bs) };
}

/** Quita el fondo automáticamente usando el color del borde. */
export function removeBackgroundAuto(data: ImageData, tolerance: number, softness: number): ImageData {
  const color = estimateBorderColor(data);
  return removeBackgroundByColor(data, color, tolerance, softness);
}

/** Color de un punto de la imagen (para el eyedropper). */
export function pickColor(data: ImageData, x: number, y: number): { r: number; g: number; b: number } {
  const p = (Math.round(y) * data.width + Math.round(x)) * 4;
  return { r: data.data[p], g: data.data[p + 1], b: data.data[p + 2] };
}

export function rgbToHex(color: { r: number; g: number; b: number }): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
