'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ASPECTS, ASPECT_ORDER, FILTERS } from '@/lib/estudio/types';
import {
  Clip,
  clipDuration,
  clipEnd,
  defaultProject,
  makeClip,
  makeText,
  TextLayer,
  Track,
  VideoProject,
} from '@/lib/estudio/video/model';
import { DEMO_CLIPS, DEMO_TONE, makeToneWavBlob } from '@/lib/estudio/video/demo';
import { renderComposition, SourceStore, syncSources } from '@/lib/estudio/video/render';
import { exportProject, ExportSettings, type FormatoExport } from '@/lib/estudio/video/export';
import { downloadBlob, formatTime, uid } from '@/lib/estudio/utils';
import { anunciarEditorAbierto } from '@/lib/editor-abierto';
import Timeline from './timeline';
import { ChipGroup, Field, Modal, Panel, Slider, Toggle } from './ui';

type InspectorTab = 'clip' | 'color' | 'filtros' | 'audio' | 'texto' | 'proyecto';
type MobileTab = 'medios' | 'vista' | 'ajustes' | 'pistas';

/**
 * El aviso del panel de clip.
 *
 * Pedido explícito de Pingui sobre el prototipo: si no hay clip seleccionado, el
 * panel NO se esconde. Se muestra igual, con el aviso «Selecciona un clip».
 * Esconderlo hacía creer que la velocidad y la transición no existían.
 */
export const AVISO_SIN_CLIP = 'Selecciona un clip';

function seedProject(): VideoProject {
  const base = defaultProject();
  const aurora = makeClip({
    id: 'clip-aurora',
    name: 'Aurora RR',
    kind: 'video',
    sourceId: 'demo-aurora',
    isDemo: true,
    demoStyle: 'aurora',
    trackId: 'v1',
    start: 0,
    inPoint: 0,
    outPoint: 8,
    transitionIn: 'cruzado',
    transitionDuration: 0.6,
  });
  const barras = makeClip({
    id: 'clip-barras',
    name: 'Barras RR',
    kind: 'video',
    sourceId: 'demo-barras',
    isDemo: true,
    demoStyle: 'barras',
    trackId: 'v1',
    start: 8,
    inPoint: 0,
    outPoint: 6,
    transitionIn: 'deslizar',
    transitionDuration: 0.5,
  });
  const tono = makeClip({
    id: 'clip-tono',
    name: 'Tono de prueba',
    kind: 'audio',
    sourceId: DEMO_TONE.id,
    isDemo: false,
    trackId: 'a1',
    start: 0,
    inPoint: 0,
    outPoint: 12,
    volume: 0.6,
  });
  const texto = makeText({
    id: 'texto-rr',
    name: 'Título',
    content: 'RR ALIADOS',
    start: 1,
    duration: 4,
    fontSize: 9,
    y: 0.44,
  });
  return { ...base, clips: [aurora, barras, tono], texts: [texto], duration: 16 };
}

/**
 * El editor de video, DENTRO del hub.
 *
 * Es el prototipo de la misión B con la ropa del Content Hub y con los tres
 * ajustes que pidió Pingui:
 *
 *   1. Exporta en **WebM y en MP4 (H.264)**, no solo WebM.
 *   2. El panel de velocidad y transición **se muestra siempre**: sin clip
 *      seleccionado aparece el aviso «Selecciona un clip».
 *   3. (El «Quitar fondo (básico)» es del editor de foto.)
 */
export default function VideoStudio() {
  const [project, setProject] = useState<VideoProject>(() => seedProject());
  const [selectedId, setSelectedId] = useState<string | null>('clip-aurora');
  const [selectedKind, setSelectedKind] = useState<'clip' | 'text' | null>('clip');
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(42);
  const [tab, setTab] = useState<InspectorTab>('clip');
  const [mobileTab, setMobileTab] = useState<MobileTab>('vista');
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [store] = useState(() => new SourceStore());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const projectRef = useRef(project);
  const playheadRef = useRef(playhead);
  const playingRef = useRef(playing);

  /**
   * Los refs se sincronizan en un efecto, nunca durante el render.
   *
   * El bucle de reproducción y los manejadores de teclado leen de aquí para
   * tener «el estado de ahora» sin volver a crear el bucle en cada cambio.
   * Escribir un ref mientras se renderiza está prohibido por las reglas de
   * React: puede hacer que el componente no se actualice como se espera.
   */
  useEffect(() => {
    projectRef.current = project;
    playheadRef.current = playhead;
    playingRef.current = playing;
  }, [project, playhead, playing]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  /** Mientras el editor está abierto, el botón flotante de la guía se aparta. */
  useEffect(() => {
    anunciarEditorAbierto(true);
    return () => anunciarEditorAbierto(false);
  }, []);

  // Prepara el audio de demostración (se genera en el navegador, sin archivos externos).
  useEffect(() => {
    let cancelled = false;
    const blob = makeToneWavBlob(DEMO_TONE.duration);
    const url = URL.createObjectURL(blob);
    void store.add(DEMO_TONE.id, url, 'audio').then(() => {
      if (!cancelled) setProject((p) => ({ ...p }));
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [store]);

  const previewSize = useMemo(() => {
    const a = ASPECTS[project.aspect];
    const scale = 620 / Math.max(a.w, a.h);
    return { w: Math.round(a.w * scale), h: Math.round(a.h * scale) };
  }, [project.aspect]);

  // Bucle de dibujo y reproducción.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) {
        const p = projectRef.current;
        let next = playheadRef.current + dt;
        if (next >= p.duration) {
          next = p.duration;
          playingRef.current = false;
          setPlaying(false);
        }
        playheadRef.current = next;
        setPlayhead(next);
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const current = projectRef.current;
          const t = playheadRef.current;
          renderComposition(ctx, current, t, store, canvas.width, canvas.height);
          syncSources(current, t, store, playingRef.current);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [store]);

  useEffect(() => {
    if (!playing) store.pauseAll();
  }, [playing, store]);

  const selectedClip = useMemo(
    () => project.clips.find((c) => c.id === selectedId && selectedKind === 'clip') ?? null,
    [project.clips, selectedId, selectedKind],
  );
  const selectedText = useMemo(
    () => project.texts.find((t) => t.id === selectedId && selectedKind === 'text') ?? null,
    [project.texts, selectedId, selectedKind],
  );

  const durations = useMemo(() => {
    const map: Record<string, number> = {};
    project.clips.forEach((c) => {
      if (c.isDemo) {
        const def = DEMO_CLIPS.find((d) => d.id === c.sourceId);
        map[c.id] = def ? def.duration : c.outPoint;
      } else {
        const src = store.get(c.sourceId);
        map[c.id] = src && src.duration ? src.duration : c.outPoint;
      }
    });
    return map;
  }, [project.clips, store]);

  const updateClip = useCallback((id: string, patch: Partial<Clip>) => {
    setProject((p) => ({
      ...p,
      clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const updateText = useCallback((id: string, patch: Partial<TextLayer>) => {
    setProject((p) => ({
      ...p,
      texts: p.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const updateTrack = useCallback((id: string, patch: Partial<Track>) => {
    setProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const endOfTrack = useCallback(
    (trackId: string) => {
      const clips = project.clips.filter((c) => c.trackId === trackId);
      return clips.reduce((acc, c) => Math.max(acc, clipEnd(c)), 0);
    },
    [project.clips],
  );

  const addDemoClip = useCallback(
    (defId: string) => {
      const def = DEMO_CLIPS.find((d) => d.id === defId);
      if (!def) return;
      const trackId = project.tracks.find((t) => t.kind === 'video')?.id ?? 'v1';
      const start = endOfTrack(trackId);
      const clip = makeClip({
        id: uid('clip'),
        name: def.name,
        kind: 'video',
        sourceId: def.id,
        isDemo: true,
        demoStyle: def.style,
        trackId,
        start,
        inPoint: 0,
        outPoint: def.duration,
        transitionIn: 'cruzado',
        transitionDuration: 0.5,
      });
      setProject((p) => ({
        ...p,
        clips: [...p.clips, clip],
        duration: Math.max(p.duration, start + def.duration),
      }));
      setSelectedId(clip.id);
      setSelectedKind('clip');
      showToast(`Clip «${def.name}» añadido a la línea de tiempo`);
    },
    [endOfTrack, project.tracks, showToast],
  );

  const addTone = useCallback(() => {
    const trackId = project.tracks.find((t) => t.kind === 'audio')?.id ?? 'a1';
    const start = endOfTrack(trackId);
    const clip = makeClip({
      id: uid('clip'),
      name: DEMO_TONE.name,
      kind: 'audio',
      sourceId: DEMO_TONE.id,
      trackId,
      start,
      inPoint: 0,
      outPoint: DEMO_TONE.duration,
      volume: 0.6,
    });
    setProject((p) => ({ ...p, clips: [...p.clips, clip] }));
    setSelectedId(clip.id);
    setSelectedKind('clip');
    showToast('Pista de audio de prueba añadida');
  }, [endOfTrack, project.tracks, showToast]);

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      let added = 0;
      for (const file of list) {
        const isVideo = file.type.startsWith('video');
        const isAudio = file.type.startsWith('audio');
        if (!isVideo && !isAudio) continue;
        const url = URL.createObjectURL(file);
        const id = uid(isVideo ? 'src' : 'aud');
        const entry = await store.add(id, url, isVideo ? 'video' : 'audio');
        const trackId = isVideo
          ? project.tracks.find((t) => t.kind === 'video')?.id ?? 'v1'
          : project.tracks.find((t) => t.kind === 'audio')?.id ?? 'a1';
        const start = endOfTrack(trackId);
        const dur = Math.min(entry.duration || 12, 60);
        const clip = makeClip({
          id: uid('clip'),
          name: file.name.replace(/\.[^.]+$/, ''),
          kind: isVideo ? 'video' : 'audio',
          sourceId: id,
          trackId,
          start,
          inPoint: 0,
          outPoint: Math.max(0.5, dur),
          volume: isAudio ? 0.8 : 1,
        });
        setProject((p) => ({
          ...p,
          clips: [...p.clips, clip],
          duration: Math.max(p.duration, start + dur),
        }));
        setSelectedId(clip.id);
        setSelectedKind('clip');
        added += 1;
      }
      if (added) showToast(`${added} archivo(s) importado(s)`);
      else showToast('Formato no admitido: usa video o audio');
    },
    [endOfTrack, project.tracks, showToast, store],
  );

  const addText = useCallback(() => {
    const text = makeText({
      id: uid('txt'),
      content: 'Nuevo texto',
      start: playheadRef.current,
      duration: 3,
      y: 0.5,
    });
    setProject((p) => ({ ...p, texts: [...p.texts, text] }));
    setSelectedId(text.id);
    setSelectedKind('text');
    setTab('texto');
    showToast('Capa de texto añadida');
  }, [showToast]);

  const splitSelected = useCallback(() => {
    if (!selectedClip) return;
    const t = playheadRef.current;
    if (t <= selectedClip.start + 0.05 || t >= clipEnd(selectedClip) - 0.05) {
      showToast('Coloca el cabezal dentro del clip para cortar');
      return;
    }
    const srcTime = selectedClip.inPoint + (t - selectedClip.start) * selectedClip.speed;
    const first = { ...selectedClip, outPoint: srcTime };
    const second = makeClip({
      ...selectedClip,
      id: uid('clip'),
      name: `${selectedClip.name} (2)`,
      start: t,
      inPoint: srcTime,
    });
    setProject((p) => ({
      ...p,
      clips: p.clips.flatMap((c) => (c.id === selectedClip.id ? [first, second] : [c])),
    }));
    setSelectedId(second.id);
    showToast('Clip cortado en dos');
  }, [selectedClip, showToast]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    if (selectedKind === 'text') {
      setProject((p) => ({ ...p, texts: p.texts.filter((t) => t.id !== selectedId) }));
    } else {
      setProject((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== selectedId) }));
    }
    setSelectedId(null);
    setSelectedKind(null);
  }, [selectedId, selectedKind]);

  const duplicateSelected = useCallback(() => {
    if (!selectedClip) return;
    const copy = makeClip({
      ...selectedClip,
      id: uid('clip'),
      name: `${selectedClip.name} (copia)`,
      start: clipEnd(selectedClip),
    });
    setProject((p) => ({ ...p, clips: [...p.clips, copy] }));
    setSelectedId(copy.id);
    showToast('Clip duplicado');
  }, [selectedClip, showToast]);

  const togglePlay = useCallback(() => {
    setPlaying((v) => {
      const next = !v;
      playingRef.current = next;
      if (next && playheadRef.current >= projectRef.current.duration - 0.02) {
        playheadRef.current = 0;
        setPlayhead(0);
      }
      return next;
    });
  }, []);

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        splitSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, splitSelected, togglePlay]);

  const aspect = ASPECTS[project.aspect];

  return (
    <div className="estudio">
      <div className="estudio-bar">
        <strong className="font-display text-sm font-bold uppercase tracking-tight text-blanco">Video</strong>
        <span className="est-badge">Formato</span>
        <div className="est-chip-row">
          {ASPECT_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              className="est-chip"
              data-active={project.aspect === k}
              aria-pressed={project.aspect === k}
              onClick={() => setProject((p) => ({ ...p, aspect: k }))}
            >
              {k}
            </button>
          ))}
        </div>
        <span className="est-badge">
          {aspect.w}×{aspect.h}
        </span>
        <label className="est-switch p-0">
          <span>FPS</span>
          <select
            className="input-brutal w-20"
            value={project.fps}
            aria-label="Fotogramas por segundo"
            onChange={(e) => setProject((p) => ({ ...p, fps: Number(e.target.value) }))}
          >
            <option value={24}>24</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
        <span className="est-spacer" />
        <button type="button" className="btn-ghost min-h-[44px]" onClick={addText}>
          + Texto
        </button>
        <button type="button" className="btn-ghost min-h-[44px]" onClick={splitSelected} title="Cortar (S)">
          Cortar
        </button>
        <button type="button" className="btn-ghost min-h-[44px]" onClick={duplicateSelected}>
          Duplicar
        </button>
        <button type="button" className="btn-ghost min-h-[44px]" onClick={deleteSelected}>
          Borrar
        </button>
        <button type="button" className="btn-brutal min-h-[44px]" onClick={() => setExportOpen(true)}>
          Exportar video
        </button>
      </div>

      <div className="estudio-mobile-tabs">
        {(
          [
            ['medios', 'Medios'],
            ['vista', 'Vista'],
            ['ajustes', 'Ajustes'],
            ['pistas', 'Pistas'],
          ] as [MobileTab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" data-active={mobileTab === id} onClick={() => setMobileTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="estudio-grid">
        {/* columna de medios */}
        <div className={`estudio-col ${mobileTab !== 'medios' ? 'est-mobile-hide' : ''}`}>
          <Panel title="Medios">
            <input
              ref={fileRef}
              type="file"
              accept="video/*,audio/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void importFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div
              className="est-drop-zone"
              data-over={dragOver}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
              }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void importFiles(e.dataTransfer.files);
              }}
            >
              Arrastra aquí tu video o audio
              <br />
              <span className="text-mostaza">o haz clic para buscar</span>
            </div>
          </Panel>

          <Panel title="Clips de demostración">
            {DEMO_CLIPS.map((d) => (
              <button key={d.id} type="button" className="est-media-item" onClick={() => addDemoClip(d.id)}>
                <span className="est-media-thumb" style={{ background: d.swatch }}>
                  {d.name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <b>{d.name}</b>
                  <span>
                    {d.duration}s · se genera en el navegador
                  </span>
                </span>
              </button>
            ))}
            <button type="button" className="est-media-item" onClick={addTone}>
              <span className="est-media-thumb" style={{ background: 'linear-gradient(135deg,#1f7a5c,#0d3a2c)' }}>
                ♪
              </span>
              <span>
                <b>{DEMO_TONE.name}</b>
                <span>
                  {DEMO_TONE.duration}s · pista de audio
                </span>
              </span>
            </button>
          </Panel>

          <Panel title="Proyecto">
            <div className="est-muted grid gap-1">
              <span>
                Duración: <b className="text-blanco">{formatTime(project.duration)}</b>
              </span>
              <span>
                Pistas: <b className="text-blanco">{project.tracks.length}</b>
              </span>
              <span>
                Clips: <b className="text-blanco">{project.clips.length}</b>
              </span>
              <span>
                Textos: <b className="text-blanco">{project.texts.length}</b>
              </span>
            </div>
            <hr className="est-hr" />
            <Field label="Color de fondo">
              <input
                type="color"
                value={project.background}
                aria-label="Color de fondo"
                onChange={(e) => setProject((p) => ({ ...p, background: e.target.value }))}
              />
            </Field>
            <Field label="Duración del proyecto (s)">
              <input
                className="input-brutal"
                type="number"
                min={2}
                max={300}
                value={Math.round(project.duration)}
                aria-label="Duración del proyecto en segundos"
                onChange={(e) =>
                  setProject((p) => ({
                    ...p,
                    duration: Math.max(2, Math.min(300, Number(e.target.value) || 2)),
                  }))
                }
              />
            </Field>
          </Panel>
        </div>

        {/* vista previa */}
        <div className={`estudio-col ${mobileTab !== 'vista' ? 'est-mobile-hide' : ''}`}>
          <div className="est-stage">
            <canvas
              ref={canvasRef}
              className="est-stage-canvas"
              width={previewSize.w}
              height={previewSize.h}
              aria-label="Vista previa del video"
              style={{ aspectRatio: `${aspect.w} / ${aspect.h}` }}
            />
          </div>
          <div className="est-transport">
            <button type="button" className="btn-ghost min-h-[44px]" onClick={() => setPlayhead(Math.max(0, playhead - 1))} title="Atrás 1 s">
              ⏮
            </button>
            <button type="button" className="btn-brutal min-h-[44px] px-4" onClick={togglePlay} title="Reproducir (espacio)">
              {playing ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              className="btn-ghost min-h-[44px]"
              onClick={() => {
                setPlaying(false);
                playingRef.current = false;
                setPlayhead(0);
                playheadRef.current = 0;
              }}
              title="Ir al inicio"
            >
              ⏹
            </button>
            <button
              type="button"
              className="btn-ghost min-h-[44px]"
              onClick={() => setPlayhead(Math.min(project.duration, playhead + 1))}
              title="Adelante 1 s"
            >
              ⏭
            </button>
            <span className="est-time-code">
              {formatTime(playhead, true, project.fps)} <span>/ {formatTime(project.duration, true, project.fps)}</span>
            </span>
            <span className="est-badge">{aspect.label}</span>
            <span className="est-badge">{project.fps} fps</span>
          </div>
        </div>

        {/* inspector */}
        <div className={`estudio-col ${mobileTab !== 'ajustes' ? 'est-mobile-hide' : ''}`}>
          <Panel title="Propiedades">
            <div className="est-tabs mb-3">
              {(
                [
                  ['clip', 'Clip'],
                  ['color', 'Color'],
                  ['filtros', 'Filtros'],
                  ['audio', 'Audio'],
                  ['texto', 'Texto'],
                  ['proyecto', 'Proyecto'],
                ] as [InspectorTab, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" data-active={tab === id} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>

            {/*
              El panel de clip NO se esconde cuando no hay selección: se muestra
              con el aviso «Selecciona un clip». Es el ajuste que pidió Pingui
              sobre el prototipo, donde el panel desaparecía y daba la impresión
              de que la velocidad y la transición no existían.
            */}
            {tab === 'clip' && !selectedClip ? (
              <div className="space-y-3" data-testid="estudio-controles-sin-clip">
                <p className="est-muted border-l-4 border-l-mostaza bg-mostaza-05 px-3 py-2" data-testid="estudio-sin-clip">
                  {AVISO_SIN_CLIP}. Toca un clip en la línea de tiempo para cambiar su velocidad, su
                  transición y su recorte.
                </p>
                <Field label="Velocidad">
                  <input
                    className="input-brutal w-full opacity-60"
                    type="range"
                    min={0.25}
                    max={4}
                    step={0.05}
                    value={1}
                    aria-label="Velocidad"
                    disabled
                  />
                </Field>
                <Field label="Transición de entrada">
                  <select className="input-brutal w-full opacity-60" aria-label="Transición de entrada" disabled value="ninguna">
                    <option value="ninguna">Elige un clip para configurar</option>
                  </select>
                </Field>
              </div>
            ) : null}

            {tab === 'clip' && selectedClip ? (
              <>
                <Field label="Nombre">
                  <input
                    className="input-brutal"
                    type="text"
                    value={selectedClip.name}
                    aria-label="Nombre del clip"
                    onChange={(e) => updateClip(selectedClip.id, { name: e.target.value })}
                  />
                </Field>
                <Slider
                  label="Velocidad"
                  value={selectedClip.speed}
                  min={0.25}
                  max={4}
                  step={0.05}
                  unit="×"
                  onChange={(v) => updateClip(selectedClip.id, { speed: v })}
                />
                <Slider
                  label="Opacidad"
                  value={selectedClip.opacity * 100}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => updateClip(selectedClip.id, { opacity: v / 100 })}
                />
                <Slider
                  label="Escala"
                  value={selectedClip.scale * 100}
                  min={25}
                  max={250}
                  unit="%"
                  onChange={(v) => updateClip(selectedClip.id, { scale: v / 100 })}
                />
                <Slider
                  label="Posición X"
                  value={selectedClip.offsetX * 100}
                  min={-50}
                  max={50}
                  unit="%"
                  onChange={(v) => updateClip(selectedClip.id, { offsetX: v / 100 })}
                />
                <Slider
                  label="Posición Y"
                  value={selectedClip.offsetY * 100}
                  min={-50}
                  max={50}
                  unit="%"
                  onChange={(v) => updateClip(selectedClip.id, { offsetY: v / 100 })}
                />
                <Slider
                  label="Rotación"
                  value={selectedClip.rotation}
                  min={-180}
                  max={180}
                  unit="°"
                  onChange={(v) => updateClip(selectedClip.id, { rotation: v })}
                />
                <hr className="est-hr" />
                <Field label="Recorte (entrada / salida en segundos)">
                  <div className="flex gap-2">
                    <input
                      className="input-brutal"
                      type="number"
                      step={0.1}
                      aria-label="Recorte de entrada"
                      value={Number(selectedClip.inPoint.toFixed(2))}
                      onChange={(e) =>
                        updateClip(selectedClip.id, {
                          inPoint: Math.max(0, Math.min(selectedClip.outPoint - 0.2, Number(e.target.value) || 0)),
                        })
                      }
                    />
                    <input
                      className="input-brutal"
                      type="number"
                      step={0.1}
                      aria-label="Recorte de salida"
                      value={Number(selectedClip.outPoint.toFixed(2))}
                      onChange={(e) =>
                        updateClip(selectedClip.id, {
                          outPoint: Math.max(selectedClip.inPoint + 0.2, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </div>
                </Field>
                <p className="est-muted">
                  Duración del clip: {clipDuration(selectedClip).toFixed(2)} s · aparece en {formatTime(selectedClip.start)} –{' '}
                  {formatTime(clipEnd(selectedClip))}
                </p>
                <hr className="est-hr" />
                <Field label="Transición de entrada">
                  <select
                    className="input-brutal"
                    value={selectedClip.transitionIn}
                    aria-label="Transición de entrada"
                    onChange={(e) => updateClip(selectedClip.id, { transitionIn: e.target.value as Clip['transitionIn'] })}
                  >
                    <option value="ninguna">Sin transición</option>
                    <option value="cruzado">Cruzado</option>
                    <option value="fundido">Fundido a negro</option>
                    <option value="deslizar">Deslizar</option>
                    <option value="zoom">Zoom</option>
                    <option value="cortina">Cortina</option>
                  </select>
                </Field>
                <Slider
                  label="Duración de la transición"
                  value={selectedClip.transitionDuration}
                  min={0.1}
                  max={3}
                  step={0.1}
                  unit="s"
                  onChange={(v) => updateClip(selectedClip.id, { transitionDuration: v })}
                />
                <Slider
                  label="Fundido de salida"
                  value={selectedClip.fadeOut}
                  min={0}
                  max={3}
                  step={0.1}
                  unit="s"
                  onChange={(v) => updateClip(selectedClip.id, { fadeOut: v })}
                />
              </>
            ) : null}

            {tab === 'color' && selectedClip ? (
              <>
                {(
                  [
                    ['exposición', 'exposure'],
                    ['contraste', 'contrast'],
                    ['saturación', 'saturation'],
                    ['temperatura', 'temperature'],
                    ['tinte', 'tint'],
                  ] as [string, 'exposure' | 'contrast' | 'saturation' | 'temperature' | 'tint'][]
                ).map(([label, key]) => (
                  <Slider
                    key={key}
                    label={label}
                    value={selectedClip.color[key]}
                    min={-100}
                    max={100}
                    onChange={(v) => updateClip(selectedClip.id, { color: { ...selectedClip.color, [key]: v } })}
                  />
                ))}
                <hr className="est-hr" />
                <button
                  type="button"
                  className="est-chip"
                  onClick={() =>
                    updateClip(selectedClip.id, {
                      color: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 },
                    })
                  }
                >
                  Reiniciar color
                </button>
              </>
            ) : null}

            {tab === 'filtros' && selectedClip ? (
              <div className="est-filter-grid">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="est-filter-card"
                    data-active={selectedClip.filterId === f.id}
                    aria-pressed={selectedClip.filterId === f.id}
                    onClick={() => updateClip(selectedClip.id, { filterId: f.id })}
                  >
                    <span className="est-filter-swatch" style={{ background: f.swatch }} />
                    <b>{f.name}</b>
                  </button>
                ))}
              </div>
            ) : null}

            {tab === 'audio' && selectedClip ? (
              <>
                <p className="est-muted">
                  {selectedClip.kind === 'audio'
                    ? 'Pista de audio: controla el volumen y el silencio.'
                    : 'Este clip es de video; su volumen durante la reproducción se controla aquí.'}
                </p>
                <Slider
                  label="Volumen"
                  value={selectedClip.volume * 100}
                  min={0}
                  max={150}
                  unit="%"
                  onChange={(v) => updateClip(selectedClip.id, { volume: v / 100 })}
                />
                <Toggle label="Silenciar este clip" checked={selectedClip.muted} onChange={(v) => updateClip(selectedClip.id, { muted: v })} />
                <hr className="est-hr" />
                <p className="est-muted">Pistas de audio del proyecto:</p>
                {project.tracks
                  .filter((t) => t.kind === 'audio')
                  .map((t) => (
                    <Toggle
                      key={t.id}
                      label={`Silenciar ${t.name}`}
                      checked={t.muted}
                      onChange={(v) => updateTrack(t.id, { muted: v })}
                    />
                  ))}
              </>
            ) : null}

            {tab === 'texto' ? (
              selectedText ? (
                <>
                  <Field label="Contenido">
                    <textarea
                      className="input-brutal min-h-20"
                      rows={3}
                      value={selectedText.content}
                      aria-label="Contenido del texto"
                      onChange={(e) => updateText(selectedText.id, { content: e.target.value })}
                    />
                  </Field>
                  <Field label="Tipografía">
                    <select
                      className="input-brutal"
                      value={selectedText.fontFamily}
                      aria-label="Tipografía del texto"
                      onChange={(e) => updateText(selectedText.id, { fontFamily: e.target.value as TextLayer['fontFamily'] })}
                    >
                      <option value="Lexend">Lexend</option>
                      <option value="Inter Tight">Inter Tight</option>
                    </select>
                  </Field>
                  <Slider
                    label="Tamaño"
                    value={selectedText.fontSize}
                    min={2}
                    max={24}
                    step={0.5}
                    unit="%"
                    onChange={(v) => updateText(selectedText.id, { fontSize: v })}
                  />
                  <Slider
                    label="Grosor"
                    value={selectedText.weight}
                    min={300}
                    max={800}
                    step={100}
                    onChange={(v) => updateText(selectedText.id, { weight: v })}
                  />
                  <Field label="Color">
                    <input
                      type="color"
                      value={selectedText.color}
                      aria-label="Color del texto"
                      onChange={(e) => updateText(selectedText.id, { color: e.target.value })}
                    />
                  </Field>
                  <Field label="Alineación">
                    <select
                      className="input-brutal"
                      value={selectedText.align}
                      aria-label="Alineación del texto"
                      onChange={(e) => updateText(selectedText.id, { align: e.target.value as 'left' | 'center' | 'right' })}
                    >
                      <option value="left">Izquierda</option>
                      <option value="center">Centro</option>
                      <option value="right">Derecha</option>
                    </select>
                  </Field>
                  <Slider
                    label="Posición X"
                    value={selectedText.x * 100}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v) => updateText(selectedText.id, { x: v / 100 })}
                  />
                  <Slider
                    label="Posición Y"
                    value={selectedText.y * 100}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v) => updateText(selectedText.id, { y: v / 100 })}
                  />
                  <Slider
                    label="Inicio"
                    value={selectedText.start}
                    min={0}
                    max={Math.max(1, project.duration)}
                    step={0.1}
                    unit="s"
                    onChange={(v) => updateText(selectedText.id, { start: v })}
                  />
                  <Slider
                    label="Duración"
                    value={selectedText.duration}
                    min={0.5}
                    max={Math.max(1, project.duration)}
                    step={0.1}
                    unit="s"
                    onChange={(v) => updateText(selectedText.id, { duration: v })}
                  />
                  <Toggle label="Mayúsculas" checked={selectedText.uppercase} onChange={(v) => updateText(selectedText.id, { uppercase: v })} />
                  <Toggle label="Sombra" checked={selectedText.shadow} onChange={(v) => updateText(selectedText.id, { shadow: v })} />
                  <Toggle label="Usar como subtítulo" checked={selectedText.subtitle} onChange={(v) => updateText(selectedText.id, { subtitle: v })} />
                </>
              ) : (
                <>
                  <p className="est-muted">
                    No hay texto seleccionado. Usa «+ Texto» en la barra superior para crear una capa de texto o subtítulos.
                  </p>
                  <button type="button" className="btn-brutal min-h-[44px]" onClick={addText}>
                    Añadir texto
                  </button>
                  {project.texts.length ? (
                    <>
                      <hr className="est-hr" />
                      <p className="est-muted">Capas de texto del proyecto:</p>
                      {project.texts.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="est-media-item"
                          onClick={() => {
                            setSelectedId(t.id);
                            setSelectedKind('text');
                          }}
                        >
                          <span className="est-media-thumb" style={{ background: '#ded116', color: '#241c00' }}>
                            T
                          </span>
                          <span>
                            <b>{t.content.slice(0, 20)}</b>
                            <span>
                              {formatTime(t.start)} · {t.duration}s
                            </span>
                          </span>
                        </button>
                      ))}
                    </>
                  ) : null}
                </>
              )
            ) : null}

            {tab === 'proyecto' ? (
              <>
                <Field label="Formato de salida">
                  <ChipGroup
                    options={ASPECT_ORDER.map((k) => ({ id: k, name: k }))}
                    value={project.aspect}
                    onChange={(k) => setProject((p) => ({ ...p, aspect: k }))}
                    ariaLabel="Formato de salida"
                  />
                </Field>
                <p className="est-muted">
                  {aspect.hint} · {aspect.w}×{aspect.h} px
                </p>
                <hr className="est-hr" />
                <p className="est-muted">Atajos: espacio reproduce, «S» corta el clip seleccionado, Supr borra la selección.</p>
              </>
            ) : null}
          </Panel>
        </div>
      </div>

      <div className={mobileTab !== 'pistas' ? 'est-mobile-hide' : ''}>
        <Timeline
          project={project}
          playhead={playhead}
          zoom={zoom}
          selectedId={selectedId}
          selectedKind={selectedKind}
          durations={durations}
          onSelect={(id, kind) => {
            setSelectedId(id);
            setSelectedKind(kind);
            if (kind === 'text') setTab('texto');
          }}
          onChangeClip={updateClip}
          onChangeText={updateText}
          onSetPlayhead={(t) => {
            setPlayhead(t);
            playheadRef.current = t;
          }}
          onToggleTrack={updateTrack}
          onZoom={setZoom}
        />
      </div>

      {exportOpen ? (
        <ExportDialog
          project={project}
          store={store}
          onClose={() => setExportOpen(false)}
          onDone={(msg) => {
            setExportOpen(false);
            showToast(msg);
          }}
        />
      ) : null}

      {toast ? <div className="est-toast">{toast}</div> : null}
    </div>
  );
}

/**
 * La ventana de exportación.
 *
 * Los dos formatos, y lo que cada uno puede y no puede:
 *
 *   - **WebM**: video VP9/VP8 y audio Opus. Se abre en cualquier navegador.
 *   - **MP4 (H.264)**: es el que piden las plataformas. El audio depende de que
 *     el navegador codifique AAC; si no, el archivo sale sin sonido y se avisa.
 */
function ExportDialog({
  project,
  store,
  onClose,
  onDone,
}: {
  project: VideoProject;
  store: SourceStore;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const aspect = ASPECTS[project.aspect];
  const [quality, setQuality] = useState(1080);
  const [fps, setFps] = useState(project.fps);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [formato, setFormato] = useState<FormatoExport>('webm');
  const [running, setRunning] = useState(false);
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState('Preparando');
  const [error, setError] = useState<string | null>(null);

  const scale = quality / Math.max(aspect.w, aspect.h);
  const settings: ExportSettings = {
    width: Math.round((aspect.w * scale) / 2) * 2,
    height: Math.round((aspect.h * scale) / 2) * 2,
    fps,
    includeAudio,
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setPct(0);
    try {
      const result = await exportProject(project, store, settings, (p) => {
        setPct(p.pct);
        setStage(p.stage);
      }, formato);
      downloadBlob(result.blob, result.filename);
      onDone(
        result.aviso
          ? `${result.filename} exportado. ${result.aviso}`
          : `Video exportado (${result.filename})`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar el video');
      setRunning(false);
    }
  };

  return (
    <Modal
      title="Exportar video"
      subtitle="La exportación se hace en este navegador: ningún archivo sale del equipo."
      onClose={running ? () => undefined : onClose}
    >
      <div className="grid gap-3">
        <Field label="Formato del archivo">
          <div className="est-chip-row">
            {(
              [
                ['webm', 'WebM (VP9 + Opus)'],
                ['mp4', 'MP4 (H.264)'],
              ] as [FormatoExport, string][]
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                className="est-chip"
                data-active={formato === id}
                aria-pressed={formato === id}
                onClick={() => setFormato(id)}
              >
                {name}
              </button>
            ))}
          </div>
        </Field>
        <p className="est-muted">
          {formato === 'webm'
            ? 'Se abre en cualquier navegador. Ideal para revisar y compartir dentro del equipo.'
            : 'Es el formato que piden las plataformas de publicación. Si este navegador no codifica H.264, el botón lo dirá y no bajará un archivo roto.'}
        </p>
        <Field label="Resolución (lado largo)">
          <div className="est-chip-row">
            {[720, 1080, 1440].map((q) => (
              <button key={q} type="button" className="est-chip" data-active={quality === q} aria-pressed={quality === q} onClick={() => setQuality(q)}>
                {q} px
              </button>
            ))}
          </div>
        </Field>
        <p className="est-muted">
          Se exportará en {settings.width}×{settings.height} px, {fps} fps, formato {aspect.label}.
        </p>
        <Field label="Fotogramas por segundo">
          <div className="est-chip-row">
            {[24, 30, 60].map((f) => (
              <button key={f} type="button" className="est-chip" data-active={fps === f} aria-pressed={fps === f} onClick={() => setFps(f)}>
                {f}
              </button>
            ))}
          </div>
        </Field>
        <Toggle label="Incluir el audio del proyecto" checked={includeAudio} onChange={setIncludeAudio} />

        {running ? (
          <>
            <div className="est-progress">
              <i style={{ width: `${Math.round(pct * 100)}%` }} />
            </div>
            <p className="est-muted">
              {stage}… {Math.round(pct * 100)}%
            </p>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="border-l-4 border-l-mostaza bg-mostaza-05 px-3 py-2 text-sm text-mostaza">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost min-h-[44px]" onClick={onClose} disabled={running}>
            Cancelar
          </button>
          <button type="button" className="btn-brutal min-h-[44px]" onClick={() => void run()} disabled={running}>
            {running ? 'Exportando…' : formato === 'mp4' ? 'Descargar MP4' : 'Descargar WebM'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
