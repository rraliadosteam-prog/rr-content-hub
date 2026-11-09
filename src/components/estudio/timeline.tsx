'use client';

import { useRef, useState } from 'react';
import { Clip, clipDuration, clipEnd, TextLayer, Track, VideoProject } from '@/lib/estudio/video/model';
import { formatTime } from '@/lib/estudio/utils';

interface TimelineProps {
  project: VideoProject;
  playhead: number;
  zoom: number;
  selectedId: string | null;
  selectedKind: 'clip' | 'text' | null;
  durations: Record<string, number>;
  onSelect: (id: string | null, kind: 'clip' | 'text' | null) => void;
  onChangeClip: (id: string, patch: Partial<Clip>) => void;
  onChangeText: (id: string, patch: Partial<TextLayer>) => void;
  onSetPlayhead: (t: number) => void;
  onToggleTrack: (id: string, patch: Partial<Track>) => void;
  onZoom: (v: number) => void;
}

const ROW_HEIGHT = 44;

type DragState = { mode: 'move' | 'in' | 'out'; clipId: string; startX: number; startY: number; orig: Clip } | null;

/**
 * La línea de tiempo del editor de video.
 *
 * Es la misma del prototipo de la misión B, con las clases del hub. Lo que se
 * puede hacer aquí: mover clips, recortar su entrada y su salida, arrastrar un
 * clip de una pista a otra y colocar el cabezal. Los cambios se devuelven
 * arriba (`onChangeClip`): la línea de tiempo no guarda estado propio del
 * proyecto, solo el de la arrastre en curso.
 */
export default function Timeline({
  project,
  playhead,
  zoom,
  selectedId,
  selectedKind,
  durations,
  onSelect,
  onChangeClip,
  onChangeText,
  onSetPlayhead,
  onToggleTrack,
  onZoom,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);
  const [dragTrack, setDragTrack] = useState<string | null>(null);

  const contentWidth = Math.max(project.duration * zoom + 180, 640);
  const step = zoom < 18 ? 5 : zoom < 34 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= project.duration + step; t += step) ticks.push(t);

  const timeFromEvent = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Math.min(project.duration, x / zoom));
  };

  const startRulerDrag = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onSetPlayhead(timeFromEvent(e.clientX));
    const move = (ev: PointerEvent) => onSetPlayhead(timeFromEvent(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startClipDrag = (e: React.PointerEvent, clip: Clip, mode: 'move' | 'in' | 'out') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(clip.id, 'clip');
    dragRef.current = { mode, clipId: clip.id, startX: e.clientX, startY: e.clientY, orig: { ...clip } };

    const move = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dt = (ev.clientX - drag.startX) / zoom;
      const o = drag.orig;
      const speed = Math.max(0.05, o.speed);
      if (drag.mode === 'move') {
        const newStart = Math.max(0, Math.round((o.start + dt) * 20) / 20);
        const patch: Partial<Clip> = { start: newStart };
        const tracksEl = tracksRef.current;
        if (tracksEl) {
          const rect = tracksEl.getBoundingClientRect();
          const index = Math.floor((ev.clientY - rect.top) / ROW_HEIGHT);
          const target = project.tracks[index];
          if (target && target.kind === o.kind && !target.locked) {
            patch.trackId = target.id;
            setDragTrack(target.id);
          }
        }
        onChangeClip(o.id, patch);
      } else if (drag.mode === 'in') {
        const maxDur = durations[o.id] ?? 3600;
        const newIn = Math.max(0, Math.min(o.outPoint - 0.2, o.inPoint + dt));
        const endFixed = clipEnd(o);
        let duration = (o.outPoint - newIn) / speed;
        let newStart = endFixed - duration;
        if (newStart < 0) {
          newStart = 0;
          duration = endFixed;
          onChangeClip(o.id, { start: 0, inPoint: Math.max(0, o.outPoint - duration * speed) });
          return;
        }
        onChangeClip(o.id, { start: newStart, inPoint: Math.max(0, Math.min(newIn, maxDur)) });
      } else {
        const maxDur = durations[o.id] ?? o.outPoint + 60;
        const newOut = Math.max(o.inPoint + 0.2, Math.min(maxDur, o.outPoint + dt));
        onChangeClip(o.id, { outPoint: newOut });
      }
    };
    const up = () => {
      dragRef.current = null;
      setDragTrack(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const renderClip = (clip: Clip) => {
    const width = Math.max(16, clipDuration(clip) * zoom);
    const selected = selectedId === clip.id && selectedKind === 'clip';
    return (
      <div
        key={clip.id}
        className="est-clip"
        data-kind={clip.kind}
        data-selected={selected}
        style={{ left: clip.start * zoom, width }}
        onPointerDown={(e) => startClipDrag(e, clip, 'move')}
        title={`${clip.name} · ${clip.speed}×`}
      >
        <span className="est-clip-handle left" onPointerDown={(e) => startClipDrag(e, clip, 'in')} title="Recortar inicio" />
        <span className="est-clip-label">
          {clip.name}
          {clip.speed !== 1 ? ` · ${clip.speed}×` : ''}
        </span>
        <span className="est-clip-handle right" onPointerDown={(e) => startClipDrag(e, clip, 'out')} title="Recortar fin" />
      </div>
    );
  };

  return (
    <div className="est-timeline">
      <div className="est-timeline-head">
        <strong className="font-mono text-[10px] uppercase tracking-[0.12em] text-blanco-70">Línea de tiempo</strong>
        <span className="est-badge">{project.tracks.filter((t) => t.kind === 'video').length} pistas de video</span>
        <span className="est-badge">{project.tracks.filter((t) => t.kind === 'audio').length} de audio</span>
        <span className="est-badge">{project.clips.length} clips</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="est-muted">Zoom</span>
          <input
            type="range"
            min={12}
            max={140}
            value={zoom}
            aria-label="Zoom de la línea de tiempo"
            className="w-28"
            onChange={(e) => {
              const v = Number(e.target.value);
              const el = scrollRef.current;
              if (el) el.scrollLeft = (el.scrollLeft / zoom) * v;
              onZoom(v);
            }}
          />
        </div>
      </div>

      <div className="est-timeline-scroll" ref={scrollRef}>
        <div className="est-timeline-inner" style={{ width: contentWidth }}>
          <div className="est-ruler" onPointerDown={startRulerDrag}>
            {ticks.map((t) => (
              <div key={t} className={`est-ruler-tick${t % step !== 0 ? ' minor' : ''}`} style={{ left: t * zoom }}>
                {formatTime(t)}
              </div>
            ))}
          </div>

          <div ref={tracksRef}>
            <div className="est-track-row">
              <div className="est-track-head">TXT</div>
              {project.texts.map((t) => (
                <div
                  key={t.id}
                  className="est-clip"
                  data-kind="text"
                  data-selected={selectedId === t.id && selectedKind === 'text'}
                  style={{ left: t.start * zoom, width: Math.max(18, t.duration * zoom) }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect(t.id, 'text');
                    const startX = e.clientX;
                    const orig = t.start;
                    const move = (ev: PointerEvent) => {
                      const dt = (ev.clientX - startX) / zoom;
                      onChangeText(t.id, { start: Math.max(0, Math.round((orig + dt) * 20) / 20) });
                    };
                    const up = () => {
                      window.removeEventListener('pointermove', move);
                      window.removeEventListener('pointerup', up);
                    };
                    window.addEventListener('pointermove', move);
                    window.addEventListener('pointerup', up);
                  }}
                >
                  <span className="est-clip-label">{t.content.slice(0, 22) || 'Texto'}</span>
                </div>
              ))}
            </div>

            {project.tracks.map((track) => (
              <div className="est-track-row" key={track.id}>
                <div className="est-track-head">
                  <button
                    title={track.muted ? 'Activar sonido' : 'Silenciar'}
                    onClick={() => onToggleTrack(track.id, { muted: !track.muted })}
                    style={track.muted ? { color: 'var(--mostaza)' } : undefined}
                  >
                    {track.muted ? '🔇' : '🔊'}
                  </button>
                  {track.kind === 'video' ? (
                    <button
                      title={track.hidden ? 'Mostrar pista' : 'Ocultar pista'}
                      onClick={() => onToggleTrack(track.id, { hidden: !track.hidden })}
                      style={track.hidden ? { color: 'var(--mostaza)' } : undefined}
                    >
                      {track.hidden ? '🚫' : '👁'}
                    </button>
                  ) : null}
                  <span>{track.name}</span>
                </div>
                {project.clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => (
                    <div key={clip.id} style={dragTrack === track.id ? { outline: '1px dashed var(--mostaza)' } : undefined}>
                      {renderClip(clip)}
                    </div>
                  ))}
              </div>
            ))}
          </div>

          <div className="est-playhead" style={{ left: playhead * zoom }} />
        </div>
      </div>
    </div>
  );
}
