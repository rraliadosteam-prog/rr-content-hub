import { DemoStyle } from "@/lib/estudio/video/model";

export interface DemoClipDef {
  id: string;
  name: string;
  style: DemoStyle;
  duration: number;
  swatch: string;
}

export const DEMO_CLIPS: DemoClipDef[] = [
  { id: "demo-aurora", name: "Aurora RR", style: "aurora", duration: 8, swatch: "linear-gradient(135deg,#be076d,#973d8f)" },
  { id: "demo-barras", name: "Barras RR", style: "barras", duration: 6, swatch: "linear-gradient(135deg,#ded116,#be076d)" },
  { id: "demo-particulas", name: "Partículas", style: "particulas", duration: 8, swatch: "linear-gradient(135deg,#973d8f,#070001)" },
  { id: "demo-ondas", name: "Ondas", style: "ondas", duration: 6, swatch: "linear-gradient(135deg,#070001,#ded116)" },
  { id: "demo-creditos", name: "Tarjeta RR", style: "creditos", duration: 5, swatch: "linear-gradient(135deg,#fffff3,#be076d)" },
];

export const DEMO_TONE = {
  id: "demo-tone",
  name: "Tono de prueba",
  duration: 12,
};

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  size: number,
  color = "#fffff3",
  weight = 700,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Lexend", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Dibuja un clip de demostración (contenido generado, sin archivos externos). */
export function drawDemoFrame(
  ctx: CanvasRenderingContext2D,
  style: DemoStyle,
  t: number,
  w: number,
  h: number,
): void {
  const u = Math.min(w, h);
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  if (style === "aurora") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#12030c");
    g.addColorStop(1, "#070001");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const blobs = [
      { c: "#be076d", r: 0.55, sx: 0.3, sy: 0.35, sp: 0.35 },
      { c: "#973d8f", r: 0.42, sx: 0.72, sy: 0.6, sp: -0.28 },
      { c: "#ded116", r: 0.28, sx: 0.55, sy: 0.28, sp: 0.5 },
    ];
    for (const b of blobs) {
      const cx = (b.sx + Math.sin(t * b.sp) * 0.16) * w;
      const cy = (b.sy + Math.cos(t * b.sp * 0.8) * 0.14) * h;
      const rad = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * b.r);
      rad.addColorStop(0, `${b.c}dd`);
      rad.addColorStop(1, `${b.c}00`);
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "#fffff3";
    ctx.lineWidth = Math.max(1, u * 0.004);
    for (let i = 0; i < 9; i++) {
      const y = ((i / 9) * h + t * 26) % h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + Math.sin(t + i) * u * 0.03);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    rr(ctx, w / 2, h * 0.46, "RR ESTUDIO", u * 0.11, "#fffff3");
    rr(ctx, w / 2, h * 0.56, "Clip de demostración", u * 0.045, "#ded116", 500);
  } else if (style === "barras") {
    const cols = ["#be076d", "#ded116", "#973d8f", "#fffff3", "#070001", "#4a1038", "#b8ad18", "#6b2a62"];
    const bw = w / 4;
    const bh = h / 4;
    const shift = (t * 0.35) % 1;
    ctx.fillStyle = "#070001";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = ((i + shift) % 4) * bw;
        const y = ((j + shift * 0.5) % 4) * bh;
        ctx.fillStyle = cols[(i + j) % cols.length];
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, y, bw, bh);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(7,0,1,0.72)";
    ctx.fillRect(0, h * 0.42, w, h * 0.16);
    rr(ctx, w / 2, h * 0.5, "BARRAS DE PRUEBA", u * 0.075, "#fffff3");
  } else if (style === "particulas") {
    const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, u * 0.8);
    g.addColorStop(0, "#2b0a24");
    g.addColorStop(1, "#070001");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const colors = ["#be076d", "#ded116", "#973d8f", "#fffff3"];
    for (let i = 0; i < 90; i++) {
      const seed = i * 12.9898;
      const speed = 0.25 + (i % 7) * 0.06;
      const ang = t * speed + seed;
      const rad = u * (0.12 + ((i * 37) % 100) / 140);
      const x = w / 2 + Math.cos(ang) * rad;
      const y = h / 2 + Math.sin(ang * 1.3) * rad * 0.9;
      const s = u * (0.004 + ((i * 13) % 7) / 900);
      ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(ang));
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    rr(ctx, w / 2, h * 0.5, "PARTÍCULAS", u * 0.085, "#fffff3");
  } else if (style === "ondas") {
    ctx.fillStyle = "#070001";
    ctx.fillRect(0, 0, w, h);
    const lines = 7;
    for (let l = 0; l < lines; l++) {
      ctx.beginPath();
      const amp = u * (0.05 + l * 0.012);
      const yBase = (h / (lines + 1)) * (l + 1);
      for (let x = 0; x <= w; x += Math.max(2, w / 120)) {
        const y =
          yBase +
          Math.sin(x / (w / (6 + l)) + t * (1.2 + l * 0.25)) * amp +
          Math.sin(x / (w / 17) - t * 0.8) * amp * 0.4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = l % 2 === 0 ? "#be076d" : "#ded116";
      ctx.globalAlpha = 0.55 - l * 0.04;
      ctx.lineWidth = Math.max(1.5, u * 0.006);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    rr(ctx, w / 2, h * 0.5, "ONDAS", u * 0.09, "#fffff3");
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#be076d");
    g.addColorStop(1, "#973d8f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#fffff3";
    ctx.lineWidth = Math.max(1, u * 0.006);
    for (let i = 0; i < 14; i++) {
      const p = ((i / 14 + t * 0.08) % 1) * w;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p - w * 0.3, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    rr(ctx, w / 2, h * 0.46, "RR ESTUDIO", u * 0.13, "#fffff3");
    rr(ctx, w / 2, h * 0.56, "Edita, exporta, comparte", u * 0.045, "#ded116", 500);
  }

  ctx.restore();
}

/** Genera un WAV corto (arpegio) para probar la pista de audio sin archivos externos. */
export function makeToneWavBlob(seconds = 12, sampleRate = 22050): Blob {
  const samples = Math.floor(seconds * sampleRate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples * 2, true);
  const notes = [220, 277.18, 329.63, 440];
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const note = notes[Math.floor(t * 2) % notes.length];
    const env = Math.min(1, (t % 0.5) * 6) * Math.max(0, 1 - (t % 0.5) * 1.6);
    const v = Math.sin(2 * Math.PI * note * t) * 0.22 * env;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
