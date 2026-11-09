import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { EncodedBlock, muxWebM } from '@/lib/estudio/webm';
import { clipDuration, clipIsActive, sourceTimeAt, VideoProject } from '@/lib/estudio/video/model';
import { renderComposition, SourceStore } from '@/lib/estudio/video/render';

/**
 * Exportación de video DENTRO del hub.
 *
 * Dos formatos, y los dos se producen en el navegador de la persona que edita:
 * ningún archivo sale del equipo y no hay servicio de terceros de por medio.
 *
 *   - **WebM** (VP9 o VP8 + Opus): el empaquetado lo hace `webm.ts`, a mano, sin
 *     dependencias. Es el formato que todos los navegadores reproducken.
 *   - **MP4 (H.264)**: lo empaqueta `mp4-muxer` sobre los fotogramas que codifica
 *     WebCodecs con `avc1`. Es el formato que pide la entrega a los equipos que
 *     suben a Instagram, TikTok o YouTube.
 *
 * Por qué los dos y no uno: WebM solo no sirve para entregar (las plataformas
 * lo rechazan), y MP4 solo no sirve para previsualizar en el navegador sin
 * conversor. Con los dos, la persona elige según para qué es el archivo.
 */

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  includeAudio: boolean;
}

export interface ExportProgress {
  pct: number;
  stage: string;
}

/** Los dos formatos que salen del editor. */
export type FormatoExport = 'webm' | 'mp4';

export interface ExportResult {
  blob: Blob;
  filename: string;
  engine: 'webcodecs' | 'mediarecorder';
  formato: FormatoExport;
  /**
   * Algo que la persona tiene que saber y que no es un error: por ejemplo, que
   * el MP4 salió sin audio porque este navegador no codifica AAC.
   */
  aviso?: string;
}

const VIDEO_CODECS = ['vp09.00.40.08', 'vp09.00.31.08', 'vp09.00.30.08', 'vp09.00.10.08', 'vp8'];

/** Códecs H.264, de menor a mayor exigencia. El primero que soporte el navegador gana. */
const VIDEO_CODECS_H264 = [
  'avc1.42001f', // Baseline 3.1
  'avc1.4d001f', // Main 3.1
  'avc1.420028', // Baseline 4.0
  'avc1.4d0028', // Main 4.0
  'avc1.640028', // High 4.0
  'avc1.640033', // High 5.1
];

async function pickVideoCodec(width: number, height: number, fps: number, bitrate: number, h264 = false) {
  if (typeof window === 'undefined' || !('VideoEncoder' in window)) return null;
  const Encoder = (window as any).VideoEncoder;
  for (const codec of h264 ? VIDEO_CODECS_H264 : VIDEO_CODECS) {
    try {
      const res = await Encoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
      if (res && res.supported) return codec;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

async function pickAudioCodec(sampleRate: number, channels: number, bitrate: number, codec = 'opus') {
  if (typeof window === 'undefined' || !('AudioEncoder' in window)) return null;
  const Encoder = (window as any).AudioEncoder;
  try {
    const res = await Encoder.isConfigSupported({ codec, sampleRate, numberOfChannels: channels, bitrate });
    if (res && res.supported) return codec;
  } catch {
    /* no disponible */
  }
  return null;
}

async function ensureSourcesAt(project: VideoProject, store: SourceStore, time: number) {
  for (const clip of project.clips) {
    if (clip.isDemo || clip.kind !== 'video') continue;
    if (!clipIsActive(clip, time)) continue;
    await store.seekExact(clip.sourceId, sourceTimeAt(clip, time));
  }
}

/** Mezcla las pistas de audio en un búfer, usando el motor de audio del navegador. */
async function renderAudioMix(
  project: VideoProject,
  store: SourceStore,
  duration: number,
  sampleRate = 48000,
): Promise<AudioBuffer | null> {
  const audioClips = project.clips.filter((c) => c.kind === 'audio');
  if (!audioClips.length) return null;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  let used = false;
  for (const clip of audioClips) {
    const src = store.get(clip.sourceId);
    if (!src || !src.ready) continue;
    try {
      const res = await fetch(src.url);
      const bytes = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = clip.muted ? 0 : clip.volume;
      node.connect(gain);
      gain.connect(ctx.destination);
      const offset = Math.max(0, clip.inPoint);
      const playDur = Math.min(clipDuration(clip), Math.max(0.01, buffer.duration - offset));
      if (playDur > 0) {
        node.start(clip.start, offset, playDur);
        used = true;
      }
    } catch {
      /* el archivo no se pudo decodificar: se omite */
    }
  }
  if (!used) return null;
  return ctx.startRendering();
}

/** Exporta el proyecto con WebCodecs (VideoEncoder + AudioEncoder) y arma el .webm. */
export async function exportWithWebCodecs(
  project: VideoProject,
  store: SourceStore,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
): Promise<Blob | null> {
  const { width, height, fps } = settings;
  const bitrate = Math.min(16_000_000, Math.max(1_500_000, Math.round(width * height * fps * 0.12)));
  const codec = await pickVideoCodec(width, height, fps, bitrate);
  if (!codec) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const blocks: EncodedBlock[] = [];
  let error: unknown = null;

  const Encoder = (window as any).VideoEncoder;
  const encoder = new Encoder({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
    output: (chunk: EncodedVideoChunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      blocks.push({ data, timestampMs: chunk.timestamp / 1000, key: chunk.type === 'key', track: 1 });
    },
    error: (e: unknown) => {
      error = e;
    },
  });
  encoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
  });

  const total = Math.max(1, Math.ceil(project.duration * fps));
  for (let i = 0; i < total; i++) {
    if (error) throw error;
    const t = i / fps;
    await ensureSourcesAt(project, store, t);
    renderComposition(ctx, project, t, store, width, height);
      const frame = new (window as any).VideoFrame(canvas, {
      timestamp: Math.round((i * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 4) {
      await new Promise((r) => setTimeout(r, 4));
    }
    if (i % 3 === 0) onProgress({ pct: (i / total) * 0.75, stage: 'Codificando video' });
  }
  await encoder.flush();
  encoder.close();
  onProgress({ pct: 0.8, stage: 'Codificando audio' });

  const audioBlocks: EncodedBlock[] = [];
  let audioCodec: 'A_OPUS' | undefined;
  if (settings.includeAudio) {
    const mix = await renderAudioMix(project, store, project.duration);
    const audioCodecName = await pickAudioCodec(48000, 2, 128000);
    if (mix && audioCodecName) {
      audioCodec = 'A_OPUS';
      const chunks: { data: Uint8Array; timestamp: number }[] = [];
          const AudioEncoderClass = (window as any).AudioEncoder;
      let audioError: unknown = null;
      const audioEncoder = new AudioEncoderClass({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 128000,
        output: (chunk: EncodedAudioChunk) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          chunks.push({ data, timestamp: chunk.timestamp });
        },
        error: (e: unknown) => {
          audioError = e;
        },
      });
      audioEncoder.configure({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 128000,
      });
      const frameSize = 9600; // 200 ms a 48 kHz
      const totalFrames = mix.length;
      const channels = mix.numberOfChannels;
      for (let offset = 0; offset < totalFrames; offset += frameSize) {
        const count = Math.min(frameSize, totalFrames - offset);
        const planar = new Float32Array(count * channels);
        for (let c = 0; c < channels; c++) {
          planar.set(mix.getChannelData(c).subarray(offset, offset + count), c * count);
        }
              const data = new (window as any).AudioData({
          format: 'f32-planar',
          sampleRate: mix.sampleRate,
          numberOfFrames: count,
          numberOfChannels: channels,
          timestamp: Math.round((offset / mix.sampleRate) * 1_000_000),
          data: planar,
        });
        audioEncoder.encode(data);
        data.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
      if (audioError) throw audioError;
      for (const c of chunks) {
        audioBlocks.push({ data: c.data, timestampMs: c.timestamp / 1000, key: true, track: 2 });
      }
    }
  }

  onProgress({ pct: 0.92, stage: 'Empaquetando el archivo' });
  const blob = muxWebM(blocks, audioBlocks, {
    width,
    height,
    videoCodec: codec.startsWith('vp8') ? 'V_VP8' : 'V_VP9',
    audioCodec,
    audioSampleRate: 48000,
    audioChannels: 2,
    durationMs: Math.round(project.duration * 1000),
  });
  onProgress({ pct: 1, stage: 'Listo' });
  return blob;
}

/**
 * Exporta el proyecto en MP4 con H.264.
 *
 * El contenedor lo arma `mp4-muxer`: los fotogramas los codifica WebCodecs con
 * `avc1` y el audio, si el navegador puede, con AAC (`mp4a.40.2`).
 *
 * Si el navegador no codifica H.264, esto devuelve `null` y quien llama avisa:
 * no se baja un MP4 que no se puede reproducir.
 */
export async function exportWithMp4(
  project: VideoProject,
  store: SourceStore,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
): Promise<{ blob: Blob; aviso?: string } | null> {
  const { width, height, fps } = settings;
  const bitrate = Math.min(16_000_000, Math.max(1_500_000, Math.round(width * height * fps * 0.12)));
  const codec = await pickVideoCodec(width, height, fps, bitrate, true);
  if (!codec) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // El audio se decide ANTES de crear el multiplexor: `mp4-muxer` necesita saber
  // desde el principio si el archivo lleva pista de audio o no.
  let audio: { codec: 'aac'; numberOfChannels: number; sampleRate: number } | undefined;
  const admiteAac = settings.includeAudio && (await pickAudioCodec(48000, 2, 128000, 'mp4a.40.2'));
  if (admiteAac) audio = { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 };

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    ...(audio ? { audio } : {}),
    fastStart: 'in-memory',
  });

  let error: unknown = null;
  const Encoder = (window as any).VideoEncoder;
  const encoder = new Encoder({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
    output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e: unknown) => {
      error = e;
    },
  });
  encoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    // `avc` (y no `annexb`): el contenedor necesita el `avcC` con los
    // parámetros del códec, y solo se obtiene si el encoder lo entrega.
    avc: { format: 'avc' },
  });

  const total = Math.max(1, Math.ceil(project.duration * fps));
  for (let i = 0; i < total; i++) {
    if (error) throw error;
    const t = i / fps;
    await ensureSourcesAt(project, store, t);
    renderComposition(ctx, project, t, store, width, height);
      const frame = new (window as any).VideoFrame(canvas, {
      timestamp: Math.round((i * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 4) {
      await new Promise((r) => setTimeout(r, 4));
    }
    if (i % 3 === 0) onProgress({ pct: (i / total) * 0.72, stage: 'Codificando video (H.264)' });
  }
  await encoder.flush();
  encoder.close();

  let aviso: string | undefined;
  if (audio) {
    onProgress({ pct: 0.8, stage: 'Codificando audio (AAC)' });
    const mix = await renderAudioMix(project, store, project.duration);
    if (mix) {
          const AudioEncoderClass = (window as any).AudioEncoder;
      let audioError: unknown = null;
      const audioEncoder = new AudioEncoderClass({
        codec: 'mp4a.40.2',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 128000,
        output: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => {
          muxer.addAudioChunk(chunk, meta);
        },
        error: (e: unknown) => {
          audioError = e;
        },
      });
      audioEncoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 128000,
      });
      const frameSize = 9600;
      const totalFrames = mix.length;
      const channels = mix.numberOfChannels;
      for (let offset = 0; offset < totalFrames; offset += frameSize) {
        const count = Math.min(frameSize, totalFrames - offset);
        const planar = new Float32Array(count * channels);
        for (let c = 0; c < channels; c++) {
          planar.set(mix.getChannelData(c).subarray(offset, offset + count), c * count);
        }
              const data = new (window as any).AudioData({
          format: 'f32-planar',
          sampleRate: mix.sampleRate,
          numberOfFrames: count,
          numberOfChannels: channels,
          timestamp: Math.round((offset / mix.sampleRate) * 1_000_000),
          data: planar,
        });
        audioEncoder.encode(data);
        data.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
      if (audioError) throw audioError;
    } else {
      aviso = 'El MP4 salió sin audio: no había pistas de audio en el proyecto.';
    }
  } else if (settings.includeAudio) {
    aviso = 'El MP4 salió sin audio: este navegador no codifica AAC. Exporta en WebM para llevar el sonido.';
  }

  onProgress({ pct: 0.95, stage: 'Empaquetando el MP4' });
  muxer.finalize();
  const buffer = muxer.target.buffer;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  onProgress({ pct: 1, stage: 'Listo' });
  return { blob, aviso };
}

/** Alternativa con MediaRecorder: se graba la vista previa en tiempo real. */
export async function exportWithMediaRecorder(
  project: VideoProject,
  store: SourceStore,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
): Promise<Blob | null> {
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = settings.width;
  canvas.height = settings.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const stream = canvas.captureStream(settings.fps);
  let audioCtx: AudioContext | null = null;
  if (settings.includeAudio) {
    try {
      audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      for (const clip of project.clips.filter((c) => c.kind === 'audio')) {
        const src = store.get(clip.sourceId);
        if (!src) continue;
        const node = audioCtx.createMediaElementSource(src.element);
        const gain = audioCtx.createGain();
        gain.gain.value = clip.muted ? 0 : clip.volume;
        node.connect(gain);
        gain.connect(dest);
        src.element.currentTime = clip.inPoint;
        src.element.loop = true;
      }
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
    } catch {
      audioCtx = null;
    }
  }

  const mimeCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
  const parts: BlobPart[] = [];
  recorder.addEventListener('dataavailable', (e: BlobEvent) => {
    if (e.data.size) parts.push(e.data);
  });
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener('stop', () => {
      // el último "dataavailable" puede llegar justo después de "stop": se espera un poco
      window.setTimeout(() => {
        const blob = new Blob(parts, { type: 'video/webm' });
        if (!blob.size) reject(new Error('El grabador del navegador no devolvió ninguna imagen.'));
        else resolve(blob);
      }, 150);
    });
    recorder.addEventListener('error', (e: Event) => reject(e));
  });
  recorder.start(200);

  const started = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      const t = Math.min(project.duration, elapsed);
      renderComposition(ctx, project, t, store, settings.width, settings.height);
      onProgress({ pct: t / project.duration, stage: 'Grabando en tiempo real' });
      if (elapsed >= project.duration) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  recorder.stop();
  store.pauseAll();
  if (audioCtx) await audioCtx.close().catch(() => undefined);
  onProgress({ pct: 1, stage: 'Listo' });
  return done;
}

/**
 * Exporta con el mejor motor disponible en este navegador.
 *
 * `formato` decide el contenedor. En MP4 no hay alternativa: si el navegador no
 * puede codificar H.264, se dice y se ofrece el WebM, en vez de bajar un
 * archivo que no se puede abrir.
 */
export async function exportProject(
  project: VideoProject,
  store: SourceStore,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  formato: FormatoExport = 'webm',
): Promise<ExportResult> {
  const base = `rr-video-${project.aspect.replace(':', 'x')}`;

  if (formato === 'mp4') {
    const salida = await exportWithMp4(project, store, settings, onProgress);
    if (!salida) {
      throw new Error('Este navegador no puede codificar H.264. Exporta en WebM: se abre en todos lados.');
    }
    return {
      blob: salida.blob,
      filename: `${base}.mp4`,
      engine: 'webcodecs',
      formato: 'mp4',
      aviso: salida.aviso,
    };
  }

  const name = `${base}.webm`;
  try {
    const blob = await exportWithWebCodecs(project, store, settings, onProgress);
    if (blob && blob.size) return { blob, filename: name, engine: 'webcodecs', formato: 'webm' };
  } catch (err) {
    console.warn('WebCodecs no pudo exportar, se usa MediaRecorder', err);
  }
  onProgress({ pct: 0.02, stage: 'Usando el grabador del navegador' });
  const blob = await exportWithMediaRecorder(project, store, settings, onProgress);
  if (!blob) throw new Error('Este navegador no puede exportar video.');
  return { blob, filename: name, engine: 'mediarecorder', formato: 'webm' };
}
