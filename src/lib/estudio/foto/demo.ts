/** Genera una imagen de demostración (sin archivos externos) para probar el editor. */
export function createDemoImage(): HTMLCanvasElement {
  const w = 1400;
  const h = 1050;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Fondo liso (sirve para probar «quitar fondo» por color).
  ctx.fillStyle = "#be076d";
  ctx.fillRect(0, 0, w, h);

  // Sujeto principal.
  ctx.save();
  ctx.translate(w / 2, h / 2 - 20);
  ctx.fillStyle = "#fffff3";
  ctx.beginPath();
  const s = 340;
  ctx.moveTo(-s, -s * 0.9);
  ctx.quadraticCurveTo(0, -s * 1.15, s, -s * 0.9);
  ctx.quadraticCurveTo(s * 1.15, 0, s * 0.9, s * 0.95);
  ctx.quadraticCurveTo(0, s * 1.15, -s * 0.9, s * 0.95);
  ctx.quadraticCurveTo(-s * 1.15, 0, -s, -s * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Marca RR.
  ctx.fillStyle = "#070001";
  ctx.font = '700 210px "Lexend", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("RR", w / 2, h / 2 - 40);

  ctx.fillStyle = "#ded116";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2 + 190, 44, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fffff3";
  ctx.font = '600 46px "Inter Tight", system-ui, sans-serif';
  ctx.fillText("FOTO PRO · RR ESTUDIO", w / 2, h - 110);

  // Cuadro guía.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, w - 80, h - 80);

  return canvas;
}
