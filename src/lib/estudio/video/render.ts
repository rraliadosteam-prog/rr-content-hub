import { colorFilter, filterCss } from "@/lib/estudio/types";
import { drawDemoFrame } from "@/lib/estudio/video/demo";
import { Clip, clipDuration, clipEnd, clipIsActive, sourceTimeAt, TextLayer, VideoProject } from "@/lib/estudio/video/model";

export interface VideoSourceEntry {
  id: string;
  url: string;
  kind: "video" | "audio";
  element: HTMLVideoElement | HTMLAudioElement;
  duration: number;
  ready: boolean;
}

/** Guarda los archivos que el usuario importa y controla su posición de lectura. */
export class SourceStore {
  private sources = new Map<string, VideoSourceEntry>();

  async add(id: string, url: string, kind: "video" | "audio"): Promise<VideoSourceEntry> {
    const element: HTMLVideoElement | HTMLAudioElement =
      kind === "video" ? document.createElement("video") : document.createElement("audio");
    element.src = url;
    element.preload = "auto";
    element.crossOrigin = "anonymous";
    element.muted = kind === "audio";
    if (element instanceof HTMLVideoElement) element.playsInline = true;
    const entry: VideoSourceEntry = { id, url, kind, element, duration: 0, ready: false };
    this.sources.set(id, entry);
    await new Promise<void>((resolve) => {
      const done = () => {
        entry.ready = true;
        entry.duration = Number.isFinite(element.duration) ? element.duration : 0;
        resolve();
      };
      element.addEventListener("loadedmetadata", done, { once: true });
      element.addEventListener("error", done, { once: true });
      window.setTimeout(done, 4000);
    });
    return entry;
  }

  get(id: string): VideoSourceEntry | undefined {
    return this.sources.get(id);
  }

  remove(id: string) {
    const s = this.sources.get(id);
    if (s) {
      s.element.pause();
      s.element.removeAttribute("src");
      s.element.load();
      this.sources.delete(id);
    }
  }

  /** Posiciona la fuente. En reproducción ajusta el ritmo; en pausa hace salto exacto. */
  sync(id: string, time: number, speed: number, playing: boolean) {
    const s = this.sources.get(id);
    if (!s || !s.ready) return;
    const el = s.element;
    const target = Math.max(0, Math.min(time, Math.max(0, s.duration - 0.05)));
    if (playing) {
      if (Math.abs(el.playbackRate - speed) > 0.01) el.playbackRate = speed;
      if (Math.abs(el.currentTime - target) > 0.28) el.currentTime = target;
      if (el.paused) void el.play().catch(() => undefined);
    } else {
      if (el.paused === false) el.pause();
      if (Math.abs(el.currentTime - target) > 0.02) el.currentTime = target;
    }
  }

  /** Salto exacto, usado durante la exportación. */
  seekExact(id: string, time: number): Promise<void> {
    const s = this.sources.get(id);
    if (!s || !s.ready) return Promise.resolve();
    const el = s.element;
    const target = Math.max(0, Math.min(time, Math.max(0, s.duration - 0.05)));
    if (Math.abs(el.currentTime - target) < 0.001) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        el.removeEventListener("seeked", finish);
        resolve();
      };
      el.addEventListener("seeked", finish);
      el.currentTime = target;
      window.setTimeout(finish, 900);
    });
  }

  pauseAll() {
    this.sources.forEach((s) => {
      if (!s.element.paused) s.element.pause();
    });
  }
}

function previousClipOnTrack(project: VideoProject, clip: Clip): Clip | undefined {
  const same = project.clips
    .filter((c) => c.trackId === clip.trackId && c.kind === clip.kind && clipEnd(c) <= clip.start + 1e-6)
    .sort((a, b) => clipEnd(b) - clipEnd(a));
  return same[0];
}

function drawSourceFrame(
  ctx: CanvasRenderingContext2D,
  project: VideoProject,
  clip: Clip,
  sourceTime: number,
  store: SourceStore,
  w: number,
  h: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, ctx.globalAlpha * alpha * clip.opacity));
  const filters = [filterCss(clip.filterId), colorFilter(clip.color)].filter((f) => f && f !== "none").join(" ");
  ctx.filter = filters || "none";

  const cx = w / 2 + clip.offsetX * w;
  const cy = h / 2 + clip.offsetY * h;
  ctx.translate(cx, cy);
  if (clip.rotation) ctx.rotate((clip.rotation * Math.PI) / 180);
  ctx.scale(clip.scale, clip.scale);
  ctx.translate(-w / 2, -h / 2);

  if (clip.isDemo) {
    drawDemoFrame(ctx, clip.demoStyle ?? "aurora", sourceTime, w, h);
  } else {
    const src = store.get(clip.sourceId);
    if (src && src.element instanceof HTMLVideoElement && src.element.readyState >= 2) {
      const vw = src.element.videoWidth || w;
      const vh = src.element.videoHeight || h;
      // Encaja la fuente dentro del lienzo conservando su proporción.
      const ratio = Math.min(w / vw, h / vh);
      const dw = vw * ratio;
      const dh = vh * ratio;
      ctx.drawImage(src.element, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = "#2a0a22";
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.restore();
}

function drawTextLayer(ctx: CanvasRenderingContext2D, text: TextLayer, w: number, h: number) {
  const size = Math.max(8, (text.fontSize / 100) * h);
  const lines = text.content.split("\n");
  ctx.save();
  ctx.font = `${text.weight} ${size}px "${text.fontFamily}", "Inter Tight", system-ui, sans-serif`;
  ctx.textAlign = text.align;
  ctx.textBaseline = "middle";
  const x = text.x * w;
  const lineHeight = size * 1.2;
  const totalHeight = lineHeight * lines.length;
  const firstY = text.y * h - totalHeight / 2 + lineHeight / 2;

  if (text.background && text.background !== "transparent") {
    ctx.fillStyle = text.background;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = size * 0.3;
    const padY = size * 0.18;
    let bx = x - widest / 2 - padX;
    if (text.align === "left") bx = x - padX;
    if (text.align === "right") bx = x - widest - padX;
    ctx.fillRect(bx, firstY - lineHeight / 2 - padY, widest + padX * 2, totalHeight + padY * 2);
  }

  if (text.shadow) {
    ctx.shadowColor = "rgba(7,0,1,0.65)";
    ctx.shadowBlur = size * 0.22;
    ctx.shadowOffsetY = size * 0.05;
  }

  lines.forEach((line, i) => {
    const content = text.uppercase ? line.toUpperCase() : line;
    const y = firstY + i * lineHeight;
    if (text.strokeWidth > 0 && text.stroke !== "transparent") {
      ctx.lineJoin = "round";
      ctx.lineWidth = (text.strokeWidth / 100) * size;
      ctx.strokeStyle = text.stroke;
      ctx.strokeText(content, x, y);
    }
    ctx.fillStyle = text.color;
    ctx.fillText(content, x, y);
  });
  ctx.restore();
}

/** Dibuja la composición completa en el momento indicado. */
export function renderComposition(
  ctx: CanvasRenderingContext2D,
  project: VideoProject,
  time: number,
  store: SourceStore,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = project.background || "#070001";
  ctx.fillRect(0, 0, w, h);

  const videoTracks = project.tracks.filter((t) => t.kind === "video" && !t.hidden);
  for (let i = videoTracks.length - 1; i >= 0; i--) {
    const track = videoTracks[i];
    const clips = project.clips
      .filter((c) => c.trackId === track.id && c.kind === "video")
      .sort((a, b) => a.start - b.start);
    for (const clip of clips) {
      if (!clipIsActive(clip, time)) continue;
      const local = time - clip.start;
      const dur = clipDuration(clip);
      const trans = clip.transitionIn;
      const td = Math.max(0.05, clip.transitionDuration);
      const inTransition = trans !== "ninguna" && local < td;
      const p = inTransition ? Math.min(1, local / td) : 1;

      if (trans === "cruzado" && inTransition) {
        const prev = previousClipOnTrack(project, clip);
        if (prev) {
          const prevTime = Math.max(prev.inPoint, prev.outPoint - 0.05);
          drawSourceFrame(ctx, project, prev, prevTime, store, w, h, 1 - p);
        } else {
          ctx.save();
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = project.background || "#070001";
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      }

      const sourceTime = sourceTimeAt(clip, time);
      if (trans === "deslizar" && inTransition) {
        ctx.save();
        ctx.translate((1 - p) * w, 0);
        drawSourceFrame(ctx, project, clip, sourceTime, store, w, h, 1);
        ctx.restore();
      } else if (trans === "cortina" && inTransition) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w * p, h);
        ctx.clip();
        drawSourceFrame(ctx, project, clip, sourceTime, store, w, h, 1);
        ctx.restore();
      } else if (trans === "zoom" && inTransition) {
        const zoom = 1 + (1 - p) * 0.35;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-w / 2, -h / 2);
        drawSourceFrame(ctx, project, clip, sourceTime, store, w, h, Math.min(1, p + 0.15));
        ctx.restore();
      } else if (trans === "fundido" && inTransition) {
        drawSourceFrame(ctx, project, clip, sourceTime, store, w, h, 1);
        ctx.save();
        ctx.globalAlpha = p;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      } else if (trans === "cruzado" && inTransition) {
        drawSourceFrame(ctx, project, clip, sourceTime, store, w, h, p);
      } else {
        drawSourceFrame(ctx, project, clip, sourceTime, store, w, h, 1);
      }

      // Fundido de salida del clip.
      if (clip.fadeOut > 0 && local > dur - clip.fadeOut) {
        const fp = Math.max(0, Math.min(1, (local - (dur - clip.fadeOut)) / clip.fadeOut));
        ctx.save();
        ctx.globalAlpha = fp;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
  }

  const texts = [...project.texts].sort((a, b) => a.start - b.start);
  for (const t of texts) {
    if (time >= t.start && time <= t.start + t.duration) {
      drawTextLayer(ctx, t, w, h);
    }
  }

  ctx.restore();
}

/** Sincroniza los archivos multimedia con el momento actual de la vista previa. */
export function syncSources(
  project: VideoProject,
  time: number,
  store: SourceStore,
  playing: boolean,
) {
  for (const clip of project.clips) {
    if (clip.isDemo) continue;
    if (!clipIsActive(clip, time)) continue;
    const sourceTime = sourceTimeAt(clip, time);
    store.sync(clip.sourceId, sourceTime, clip.speed, playing);
  }
}
