'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FILTERS } from '@/lib/estudio/types';
import {
  cloneProject,
  DEFAULT_ADJUSTMENTS,
  makeImageLayer,
  makeTextLayer,
  PhotoLayer,
  PhotoProject,
} from '@/lib/estudio/foto/model';
import {
  applyMask,
  floodFillMask,
  removeBackgroundAuto,
  removeBackgroundByColor,
  rgbToHex,
  hexToRgb,
} from '@/lib/estudio/foto/imageops';
import { compose, readPixel, SourceMap } from '@/lib/estudio/foto/compose';
import { createDemoImage } from '@/lib/estudio/foto/demo';
import { downloadBlob, uid } from '@/lib/estudio/utils';
import { Field, Modal, Panel, Slider, Toggle } from './ui';

type Tool = 'mover' | 'recortar' | 'fondo';
type BgMode = 'color' | 'borde' | 'auto';
type PanelTab = 'capas' | 'ajustes' | 'filtros' | 'recorte' | 'fondo' | 'texto';
type MobileTab = 'herramientas' | 'imagen' | 'ajustes' | 'capas';
type CropRect = { x: number; y: number; w: number; h: number };

const CROP_RATIOS: { id: string; name: string; ratio: number | null }[] = [
  { id: 'libre', name: 'Libre', ratio: null },
  { id: '1:1', name: '1:1', ratio: 1 },
  { id: '4:5', name: '4:5', ratio: 4 / 5 },
  { id: '9:16', name: '9:16', ratio: 9 / 16 },
  { id: '16:9', name: '16:9', ratio: 16 / 9 },
];

/**
 * AVISO HONESTO DEL RECORTE DE FONDO.
 *
 * Se calcula en el navegador, por color y por inundación: es una heurística
 * local, no hay IA detrás. Por eso el botón se rotula «Quitar fondo (básico)»:
 * prometer un recorte automático de calidad de estudio con este cálculo sería
 * mentir. Cuando exista IA real, se quitará el «(básico)».
 */
export const AVISO_QUITAR_FONDO =
  'El recorte de fondo es básico: se calcula en este navegador por color y por bordes. No hay IA detrás, así que con fondos complicados hay que ajustar la tolerancia.';

function initialProject(): PhotoProject {
  return {
    width: 1400,
    height: 1050,
    background: '#070001',
    filterId: 'original',
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    layers: [
      makeImageLayer({
        id: 'layer-foto',
        name: 'Foto de demostración',
        srcId: 'demo-photo',
        naturalWidth: 1400,
        naturalHeight: 1050,
        scale: 1,
      }),
      makeTextLayer({
        id: 'layer-texto',
        name: 'Texto RR',
        text: 'RR ALIADOS',
        fontSize: 76,
        y: 330,
        fontColor: '#fffff3',
      }),
    ],
  };
}

type Props = {
  /**
   * Nombre del archivo que se está editando. Cuando viene de Material, el
   * editor se abre sobre ese archivo y no sobre la foto de ejemplo.
   */
  nombreArchivo?: string;
  /** URL de la imagen a editar (object URL o data URL). */
  srcInicial?: string;
  /**
   * Se llama al guardar la versión editada. Si no viene, el editor exporta el
   * archivo al disco de la persona (que es lo que se hace en la sección).
   */
  onGuardar?: (blob: Blob, nombre: string) => void | Promise<void>;
  /** Para cerrar el editor cuando está embebido en Material. */
  onCancelar?: () => void;
};

/**
 * El editor de foto, DENTRO del hub.
 *
 * Es el prototipo de la misión B, adaptado al Content Hub: mismo motor (lienzo
 * 2D, sin servidor y sin dependencias) y otra ropa (los controles del hub).
 *
 * Lo que hace: capas, recorte, ajustes de luz y color, filtros, texto,
 * «Quitar fondo (básico)» y exportación. Lo que NO hace: subir nada a ningún
 * sitio ni tocar el archivo original.
 */
export default function PhotoStudio({ nombreArchivo, srcInicial, onGuardar, onCancelar }: Props = {}) {
  const [project, setProject] = useState<PhotoProject>(() => initialProject());
  const [selectedId, setSelectedId] = useState<string | null>('layer-foto');
  const [tool, setTool] = useState<Tool>('mover');
  const [panelTab, setPanelTab] = useState<PanelTab>('capas');
  const [mobileTab, setMobileTab] = useState<MobileTab>('herramientas');
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [cropRatio, setCropRatio] = useState<string>('libre');
  const [bgMode, setBgMode] = useState<BgMode>('color');
  const [bgColor, setBgColor] = useState('#be076d');
  const [tolerance, setTolerance] = useState(42);
  const [softness, setSoftness] = useState(28);
  const [invertMask, setInvertMask] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  /**
   * El estado del historial vive en ESTADO, no en refs.
   *
   * Los refs guardan la pila (past/future) porque se mutan dentro de
   * manejadores. Pero la barra de arriba necesita saber si se puede deshacer y
   * cuántos pasos hay: eso se pinta en cada render, y leer un ref durante el
   * render está prohibido.
   */
  const [historia, setHistoria] = useState({ pasos: 0, deshacer: false, rehacer: false });
  const [guardando, setGuardando] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const sourcesRef = useRef<SourceMap>(new Map());
  const pastRef = useRef<PhotoProject[]>([]);
  const futureRef = useRef<PhotoProject[]>([]);
  const projectRef = useRef(project);

  /**
   * El ref se sincroniza en un efecto, no durante el render.
   *
   * El editor usa el ref para leer «el proyecto de ahora» desde manejadores de
   * eventos y de punteros, que corren fuera del render. Escribir el ref
   * durante el render está prohibido por las reglas de React: puede hacer que
   * el componente no se actualice como se espera.
   */
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  /**
   * La imagen de arranque: la que llega del material o, si no hay ninguna, la
   * de ejemplo (que se genera aquí mismo, sin archivos externos).
   */
  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!srcInicial) {
        const canvas = createDemoImage();
        if (cancelado) return;
        sourcesRef.current.set('demo-photo', { el: canvas, width: canvas.width, height: canvas.height });
        setProject((p) => ({
          ...p,
          layers: p.layers.map((l) =>
            l.srcId === 'demo-photo' ? { ...l, naturalWidth: canvas.width, naturalHeight: canvas.height } : l,
          ),
        }));
        return;
      }
      const imagen = new Image();
      await new Promise<void>((resolve) => {
        imagen.onload = () => resolve();
        imagen.onerror = () => resolve();
        imagen.src = srcInicial;
      });
      if (cancelado) return;
      const w = imagen.naturalWidth || 1400;
      const h = imagen.naturalHeight || 1050;
      sourcesRef.current.set('demo-photo', { el: imagen, width: w, height: h });
      setProject((p) => ({
        ...p,
        width: w,
        height: h,
        layers: p.layers.map((l) =>
          l.srcId === 'demo-photo'
            ? { ...l, name: nombreArchivo || 'Foto', naturalWidth: w, naturalHeight: h, scale: 1 }
            : l,
        ),
      }));
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [srcInicial, nombreArchivo]);

  const pushHistory = useCallback(() => {
    pastRef.current = [...pastRef.current.slice(-39), cloneProject(projectRef.current)];
    futureRef.current = [];
    setHistoria({ pasos: pastRef.current.length, deshacer: pastRef.current.length > 0, rehacer: false });
    setHistoryTick((v) => v + 1);
  }, []);

  const applyLive = useCallback((fn: (p: PhotoProject) => PhotoProject) => {
    const next = fn(projectRef.current);
    projectRef.current = next;
    setProject(next);
  }, []);

  const apply = useCallback(
    (fn: (p: PhotoProject) => PhotoProject) => {
      pushHistory();
      applyLive(fn);
    },
    [applyLive, pushHistory],
  );

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (!past.length) return;
    const prev = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [cloneProject(projectRef.current), ...futureRef.current].slice(0, 40);
    projectRef.current = prev;
    setProject(prev);
    setHistoria({ pasos: pastRef.current.length, deshacer: pastRef.current.length > 0, rehacer: futureRef.current.length > 0 });
    setHistoryTick((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (!future.length) return;
    const next = future[0];
    futureRef.current = future.slice(1);
    pastRef.current = [...pastRef.current, cloneProject(projectRef.current)].slice(-40);
    projectRef.current = next;
    setProject(next);
    setHistoria({ pasos: pastRef.current.length, deshacer: pastRef.current.length > 0, rehacer: futureRef.current.length > 0 });
    setHistoryTick((v) => v + 1);
  }, []);

  // Redibuja la composición cuando cambia el proyecto.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const p = project;
      if (canvas.width !== p.width || canvas.height !== p.height) {
        canvas.width = p.width;
        canvas.height = p.height;
      }
      compose(canvas, p, sourcesRef.current, 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [project]);

  const selectedLayer = useMemo(
    () => project.layers.find((l) => l.id === selectedId) ?? null,
    [project.layers, selectedId],
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<PhotoLayer>, commit = true) => {
      const fn = (p: PhotoProject) => ({
        ...p,
        layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      });
      if (commit) apply(fn);
      else applyLive(fn);
    },
    [apply, applyLive],
  );

  const importImages = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image'));
      if (!list.length) {
        showToast('Selecciona un archivo de imagen');
        return;
      }
      for (const file of list) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        });
        const w = img.naturalWidth || 1400;
        const h = img.naturalHeight || 1050;
        const id = uid('src');
        sourcesRef.current.set(id, { el: img, width: w, height: h });
        const scale = Math.min(projectRef.current.width / w, projectRef.current.height / h) * 0.9;
        const layer = makeImageLayer({
          id: uid('layer'),
          name: file.name.replace(/\.[^.]+$/, ''),
          srcId: id,
          naturalWidth: w,
          naturalHeight: h,
          scale,
        });
        apply((p) => ({ ...p, layers: [...p.layers, layer] }));
        setSelectedId(layer.id);
      }
      showToast(`${list.length} imagen(es) añadida(s) como capa`);
    },
    [apply, showToast],
  );

  const addTextLayer = useCallback(() => {
    const layer = makeTextLayer({ id: uid('layer'), name: 'Texto', text: 'Texto RR', y: 0 });
    apply((p) => ({ ...p, layers: [...p.layers, layer] }));
    setSelectedId(layer.id);
    setPanelTab('texto');
    showToast('Capa de texto añadida: arrástrala en el lienzo');
  }, [apply, showToast]);

  const removeLayer = useCallback(
    (id: string) => {
      apply((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) }));
      if (selectedId === id) setSelectedId(null);
    },
    [apply, selectedId],
  );

  const moveLayer = useCallback(
    (id: string, direction: -1 | 1) => {
      apply((p) => {
        const index = p.layers.findIndex((l) => l.id === id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= p.layers.length) return p;
        const layers = p.layers.slice();
        const [item] = layers.splice(index, 1);
        layers.splice(target, 0, item);
        return { ...p, layers };
      });
    },
    [apply],
  );

  const docPoint = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, scale: 1 };
    const rect = canvas.getBoundingClientRect();
    const scale = projectRef.current.width / rect.width;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale, scale };
  };

  const hitLayer = useCallback((x: number, y: number): PhotoLayer | null => {
    const p = projectRef.current;
    for (let i = p.layers.length - 1; i >= 0; i--) {
      const layer = p.layers[i];
      if (!layer.visible) continue;
      const cx = p.width / 2 + layer.x;
      const cy = p.height / 2 + layer.y;
      if (layer.type === 'image') {
        const src = sourcesRef.current.get(layer.srcId ?? '');
        const hw = ((src?.width ?? layer.naturalWidth) * layer.scale) / 2;
        const hh = ((src?.height ?? layer.naturalHeight) * layer.scale) / 2;
        if (Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh) return layer;
      } else {
        const size = (layer.fontSize ?? 64) * layer.scale;
        const halfW = (layer.text ?? '').length * size * 0.3;
        if (Math.abs(x - cx) <= halfW && Math.abs(y - cy) <= size) return layer;
      }
    }
    return null;
  }, []);

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const { x, y } = docPoint(e);
    if (tool === 'recortar') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const start = { x, y };
      const ratio = CROP_RATIOS.find((r) => r.id === cropRatio)?.ratio ?? null;
      const move = (ev: PointerEvent) => {
        const p = docPoint(ev);
        let w = p.x - start.x;
        let h = p.y - start.y;
        if (ratio) {
          const signW = w < 0 ? -1 : 1;
          const signH = h < 0 ? -1 : 1;
          w = Math.abs(w);
          h = w / ratio;
          if (signH < 0) h = -h;
          if (signW < 0) w = -w;
        }
        setCrop({
          x: w < 0 ? start.x + w : start.x,
          y: h < 0 ? start.y + h : start.y,
          w: Math.abs(w),
          h: Math.abs(h),
        });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }

    if (tool === 'fondo') {
      const layer = selectedLayer && selectedLayer.type === 'image' ? selectedLayer : null;
      if (!layer) {
        showToast('Selecciona primero una capa de imagen');
        return;
      }
      const src = sourcesRef.current.get(layer.srcId ?? '');
      if (!src) return;
      const color = readPixel(src, x, y, layer.x, layer.y, layer.scale, projectRef.current.width, projectRef.current.height);
      if (bgMode === 'color' || bgMode === 'auto') {
        setBgColor(rgbToHex(color));
      }
      const sx = Math.round((x - (projectRef.current.width / 2 + layer.x)) / layer.scale + src.width / 2);
      const sy = Math.round((y - (projectRef.current.height / 2 + layer.y)) / layer.scale + src.height / 2);
      runBackgroundRemoval(bgMode, color, { x: sx, y: sy });
      return;
    }

    const layer = hitLayer(x, y);
    if (!layer) {
      setSelectedId(null);
      return;
    }
    setSelectedId(layer.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    const originX = layer.x;
    const originY = layer.y;
    const startPoint = { x, y };
    pushHistory();
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = docPoint(ev);
      const dx = p.x - startPoint.x;
      const dy = p.y - startPoint.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
      updateLayer(layer.id, { x: originX + dx, y: originY + dy }, false);
    };
    const up = () => {
      if (!moved) pastRef.current = pastRef.current.slice(0, -1);
      else setHistoryTick((v) => v + 1);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const runBackgroundRemoval = useCallback(
    (mode: BgMode, color: { r: number; g: number; b: number }, point: { x: number; y: number }) => {
      const layer = selectedLayer;
      if (!layer || layer.type !== 'image') {
        showToast('Selecciona una capa de imagen');
        return;
      }
      const src = sourcesRef.current.get(layer.srcId ?? '');
      if (!src) return;
      const canvas = document.createElement('canvas');
      canvas.width = src.width;
      canvas.height = src.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(src.el, 0, 0);
      const data = ctx.getImageData(0, 0, src.width, src.height);
      if (mode === 'color') {
        removeBackgroundByColor(data, color, tolerance, softness);
      } else if (mode === 'auto') {
        removeBackgroundAuto(data, tolerance, softness);
      } else {
        const mask = floodFillMask(data, point.x, point.y, tolerance);
        applyMask(data, mask, invertMask);
      }
      ctx.putImageData(data, 0, 0);
      const newId = uid('src');
      sourcesRef.current.set(newId, { el: canvas, width: canvas.width, height: canvas.height });
      apply((p) => ({
        ...p,
        layers: p.layers.map((l) => (l.id === layer.id ? { ...l, srcId: newId } : l)),
      }));
      showToast('Fondo quitado (básico): todo el proceso se hizo en este navegador');
    },
    [apply, invertMask, selectedLayer, showToast, softness, tolerance],
  );

  const applyCrop = useCallback(() => {
    if (!crop || crop.w < 10 || crop.h < 10) {
      showToast('Dibuja primero un área de recorte en el lienzo');
      return;
    }
    apply((cur) => ({
      ...cur,
      width: Math.round(crop.w),
      height: Math.round(crop.h),
      layers: cur.layers.map((l) => ({
        ...l,
        x: l.x + (cur.width / 2 - (crop.x + crop.w / 2)),
        y: l.y + (cur.height / 2 - (crop.y + crop.h / 2)),
      })),
    }));
    setCrop(null);
    showToast('Recorte aplicado');
  }, [apply, crop, showToast]);

  /** Pinta el proyecto en un lienzo nuevo y lo devuelve como PNG. */
  const renderPng = useCallback(async (scale = 1): Promise<Blob | null> => {
    const p = projectRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(p.width * scale);
    canvas.height = Math.round(p.height * scale);
    compose(canvas, p, sourcesRef.current, scale);
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  }, []);

  const exportImage = useCallback(
    async (format: 'png' | 'jpeg' | 'webp', scale: number) => {
      const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      const p = projectRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(p.width * scale);
      canvas.height = Math.round(p.height * scale);
      compose(canvas, p, sourcesRef.current, scale);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.92));
      if (!blob) {
        showToast('No se pudo generar la imagen');
        return;
      }
      downloadBlob(blob, `rr-hub-foto.${format === 'jpeg' ? 'jpg' : format}`);
      showToast('Imagen exportada');
    },
    [showToast],
  );

  /**
   * Guardar la versión editada (así lo llama Material): entrega el PNG al hub
   * para que lo registre como una versión nueva del archivo.
   */
  const guardarVersion = useCallback(async () => {
    if (!onGuardar) return;
    setGuardando(true);
    try {
      const blob = await renderPng(1);
      if (!blob) throw new Error('El navegador no pudo generar la imagen.');
      const nombre = `${(nombreArchivo || 'foto').replace(/\.[^.]+$/, '')}_editado.png`;
      await onGuardar(blob, nombre);
      showToast('Versión editada lista');
    } catch (fallo) {
      showToast(fallo instanceof Error ? fallo.message : 'No se pudo guardar la versión editada.');
    } finally {
      setGuardando(false);
    }
  }, [nombreArchivo, onGuardar, renderPng, showToast]);

  const layersTopFirst = [...project.layers].reverse();

  return (
    <div className="estudio" data-testid="editor-foto">
      <div className="estudio-bar">
        <strong className="font-display text-sm font-bold uppercase tracking-tight text-blanco">Foto</strong>
        <span className="est-badge">
          {project.width}×{project.height}
        </span>
        <button type="button" className="btn-ghost min-h-[44px]" onClick={undo} disabled={!historia.deshacer} title="Deshacer (Ctrl+Z)">
          ↶ Deshacer
        </button>
        <button type="button" className="btn-ghost min-h-[44px]" onClick={redo} disabled={!historia.rehacer} title="Rehacer">
          ↷ Rehacer
        </button>
        <span className="est-badge">{historia.pasos} pasos</span>
        <span className="est-spacer" />
        <button type="button" className="btn-ghost min-h-[44px]" onClick={addTextLayer}>
          + Texto
        </button>
        {onGuardar ? (
          <button type="button" className="btn-brutal min-h-[44px]" onClick={() => void guardarVersion()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar versión editada'}
          </button>
        ) : (
          <button type="button" className="btn-brutal min-h-[44px]" onClick={() => setExportOpen(true)}>
            Exportar imagen
          </button>
        )}
        {onCancelar ? (
          <button type="button" className="btn-ghost min-h-[44px]" onClick={onCancelar}>
            Cerrar
          </button>
        ) : null}
      </div>

      <div className="estudio-mobile-tabs">
        {(
          [
            ['herramientas', 'Herramientas'],
            ['imagen', 'Imagen'],
            ['ajustes', 'Ajustes'],
            ['capas', 'Capas'],
          ] as [MobileTab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" data-active={mobileTab === id} onClick={() => setMobileTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="estudio-grid">
        <div className={`estudio-col ${mobileTab !== 'herramientas' && mobileTab !== 'imagen' ? 'est-mobile-hide' : ''}`}>
          <Panel title="Herramientas">
            <div className="est-chip-row">
              {(
                [
                  ['mover', 'Mover'],
                  ['recortar', 'Recortar'],
                  ['fondo', 'Quitar fondo (básico)'],
                ] as [Tool, string][]
              ).map(([id, name]) => (
                <button key={id} type="button" className="est-chip" data-active={tool === id} aria-pressed={tool === id} onClick={() => setTool(id)}>
                  {name}
                </button>
              ))}
            </div>
            <p className="est-muted mt-3">
              {tool === 'mover'
                ? 'Arrastra cualquier capa sobre el lienzo para colocarla.'
                : tool === 'recortar'
                  ? 'Arrastra sobre el lienzo para marcar el área de recorte.'
                  : 'Haz clic sobre el fondo de la imagen para seleccionarlo y quitarlo.'}
            </p>
          </Panel>

          <Panel title="Imagen">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void importImages(e.target.files);
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
                void importImages(e.dataTransfer.files);
              }}
            >
              Arrastra tu foto aquí
              <br />
              <span className="text-mostaza">o haz clic para buscar</span>
            </div>
            <hr className="est-hr" />
            <Field label="Fondo del lienzo">
              <input
                type="color"
                value={project.background}
                aria-label="Fondo del lienzo"
                onChange={(e) => apply((p) => ({ ...p, background: e.target.value }))}
              />
            </Field>
            <div className="flex gap-2">
              <button type="button" className="est-chip" onClick={() => apply((p) => ({ ...p, width: 1400, height: 1050 }))}>
                4:3
              </button>
              <button type="button" className="est-chip" onClick={() => apply((p) => ({ ...p, width: 1080, height: 1350 }))}>
                4:5
              </button>
              <button type="button" className="est-chip" onClick={() => apply((p) => ({ ...p, width: 1080, height: 1080 }))}>
                1:1
              </button>
              <button type="button" className="est-chip" onClick={() => apply((p) => ({ ...p, width: 1080, height: 1920 }))}>
                9:16
              </button>
            </div>
          </Panel>
        </div>

        <div className={`estudio-col ${mobileTab !== 'herramientas' ? 'est-mobile-hide' : ''}`}>
          <div className="est-photo-stage">
            <div className="est-photo-canvas-wrap">
              <canvas
                ref={canvasRef}
                className="est-photo-canvas"
                width={project.width}
                height={project.height}
                aria-label="Lienzo de edición de la foto"
                style={{ cursor: tool === 'mover' ? 'grab' : tool === 'recortar' ? 'crosshair' : 'cell' }}
                onPointerDown={onCanvasPointerDown}
              />
              {crop ? (
                <div
                  className="est-crop-box"
                  style={{
                    left: `${(crop.x / project.width) * 100}%`,
                    top: `${(crop.y / project.height) * 100}%`,
                    width: `${(crop.w / project.width) * 100}%`,
                    height: `${(crop.h / project.height) * 100}%`,
                  }}
                >
                  <span className="est-crop-handle" style={{ left: -6, top: -6 }} />
                  <span className="est-crop-handle" style={{ right: -6, top: -6 }} />
                  <span className="est-crop-handle" style={{ left: -6, bottom: -6 }} />
                  <span className="est-crop-handle" style={{ right: -6, bottom: -6 }} />
                </div>
              ) : null}
            </div>
          </div>
          <div className="est-transport">
            <span className="est-badge">{tool === 'mover' ? 'Mover' : tool === 'recortar' ? 'Recortar' : 'Quitar fondo (básico)'}</span>
            <span className="est-badge">
              {project.width}×{project.height} px
            </span>
            {selectedLayer ? <span className="est-badge">Capa: {selectedLayer.name}</span> : null}
          </div>
        </div>

        <div className={`estudio-col ${mobileTab !== 'capas' && mobileTab !== 'ajustes' ? 'est-mobile-hide' : ''}`}>
          <Panel title="Editor de foto">
            <div className="est-tabs mb-3">
              {(
                [
                  ['capas', 'Capas'],
                  ['ajustes', 'Ajustes'],
                  ['filtros', 'Filtros'],
                  ['recorte', 'Recorte'],
                  ['fondo', 'Fondo'],
                  ['texto', 'Texto'],
                ] as [PanelTab, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" data-active={panelTab === id} onClick={() => setPanelTab(id)}>
                  {label}
                </button>
              ))}
            </div>

            {panelTab === 'capas' ? (
              <>
                {layersTopFirst.map((layer) => (
                  <div
                    key={layer.id}
                    className="est-layer-item"
                    data-selected={selectedId === layer.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(layer.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedId(layer.id);
                    }}
                  >
                    <button
                      type="button"
                      className="est-eye"
                      data-on={layer.visible}
                      title={layer.visible ? 'Ocultar' : 'Mostrar'}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateLayer(layer.id, { visible: !layer.visible });
                      }}
                    >
                      {layer.visible ? '👁' : '–'}
                    </button>
                    <b>{layer.name}</b>
                    <span>{layer.type === 'image' ? 'IMG' : 'TXT'}</span>
                    <button
                      type="button"
                      className="est-eye"
                      title="Subir"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(layer.id, 1);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="est-eye"
                      title="Bajar"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(layer.id, -1);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="est-eye"
                      title="Eliminar"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLayer(layer.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <hr className="est-hr" />
                <button type="button" className="est-chip" onClick={addTextLayer}>
                  + Capa de texto
                </button>
                <button type="button" className="est-chip" onClick={() => fileRef.current?.click()}>
                  + Capa de imagen
                </button>
                {selectedLayer ? (
                  <>
                    <hr className="est-hr" />
                    <Slider
                      label="Opacidad de la capa"
                      value={selectedLayer.opacity * 100}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(v) => updateLayer(selectedLayer.id, { opacity: v / 100 }, false)}
                    />
                    <Field label="Mezcla">
                      <select
                        className="input-brutal"
                        value={selectedLayer.blend}
                        aria-label="Mezcla de la capa"
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, {
                            blend: e.target.value as PhotoLayer['blend'],
                          })
                        }
                      >
                        <option value="normal">Normal</option>
                        <option value="multiply">Multiplicar</option>
                        <option value="screen">Trama</option>
                        <option value="overlay">Superponer</option>
                        <option value="lighten">Aclarar</option>
                        <option value="darken">Oscurecer</option>
                      </select>
                    </Field>
                    <Slider
                      label="Escala"
                      value={selectedLayer.scale * 100}
                      min={10}
                      max={300}
                      unit="%"
                      onChange={(v) => updateLayer(selectedLayer.id, { scale: v / 100 }, false)}
                    />
                    <Slider
                      label="Rotación"
                      value={selectedLayer.rotation}
                      min={-180}
                      max={180}
                      unit="°"
                      onChange={(v) => updateLayer(selectedLayer.id, { rotation: v }, false)}
                    />
                    <Toggle
                      label="Voltear horizontal"
                      checked={selectedLayer.flipH}
                      onChange={(v) => updateLayer(selectedLayer.id, { flipH: v })}
                    />
                  </>
                ) : null}
              </>
            ) : null}

            {panelTab === 'ajustes' ? (
              <>
                {(
                  [
                    ['exposición', 'exposure'],
                    ['contraste', 'contrast'],
                    ['saturación', 'saturation'],
                    ['temperatura', 'temperature'],
                    ['tinte', 'tint'],
                    ['luces', 'highlights'],
                    ['sombras', 'shadows'],
                    ['vibrancia', 'vibrance'],
                    ['desvanecido', 'fade'],
                    ['grano', 'grain'],
                  ] as [string, keyof PhotoProject['adjustments']][]
                ).map(([label, key]) => (
                  <div key={key} onPointerDown={() => pushHistory()}>
                    <Slider
                      label={label}
                      value={project.adjustments[key]}
                      min={key === 'grain' ? 0 : -100}
                      max={100}
                      onChange={(v) => applyLive((p) => ({ ...p, adjustments: { ...p.adjustments, [key]: v } }))}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="est-chip"
                  onClick={() => apply((p) => ({ ...p, adjustments: { ...DEFAULT_ADJUSTMENTS } }))}
                >
                  Reiniciar ajustes
                </button>
              </>
            ) : null}

            {panelTab === 'filtros' ? (
              <div className="est-filter-grid">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="est-filter-card"
                    data-active={project.filterId === f.id}
                    aria-pressed={project.filterId === f.id}
                    onClick={() => apply((p) => ({ ...p, filterId: f.id }))}
                  >
                    <span className="est-filter-swatch" style={{ background: f.swatch }} />
                    <b>{f.name}</b>
                  </button>
                ))}
              </div>
            ) : null}

            {panelTab === 'recorte' ? (
              <>
                <Field label="Proporción">
                  <div className="est-chip-row">
                    {CROP_RATIOS.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="est-chip"
                        data-active={cropRatio === r.id}
                        aria-pressed={cropRatio === r.id}
                        onClick={() => setCropRatio(r.id)}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                </Field>
                <p className="est-muted">
                  Elige la proporción, activa la herramienta «Recortar» y arrastra sobre la imagen.
                </p>
                <button type="button" className="est-chip" onClick={() => setTool('recortar')}>
                  Recortar en el lienzo
                </button>
                <button type="button" className="btn-brutal min-h-[44px]" onClick={applyCrop} disabled={!crop}>
                  Aplicar recorte
                </button>
                {crop ? (
                  <button type="button" className="est-chip" onClick={() => setCrop(null)}>
                    Cancelar recorte
                  </button>
                ) : null}
                {crop ? (
                  <p className="est-muted">
                    Área: {Math.round(crop.w)}×{Math.round(crop.h)} px
                  </p>
                ) : null}
              </>
            ) : null}

            {panelTab === 'fondo' ? (
              <>
                <p className="est-muted border-l-4 border-l-mostaza bg-mostaza-05 px-3 py-2">{AVISO_QUITAR_FONDO}</p>
                <Field label="Método">
                  <div className="est-chip-row">
                    {(
                      [
                        ['color', 'Por color'],
                        ['borde', 'Desde el borde'],
                        ['auto', 'Automático'],
                      ] as [BgMode, string][]
                    ).map(([id, name]) => (
                      <button key={id} type="button" className="est-chip" data-active={bgMode === id} aria-pressed={bgMode === id} onClick={() => setBgMode(id)}>
                        {name}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Color a quitar">
                  <div className="flex items-center gap-2">
                    <input type="color" value={bgColor} aria-label="Color a quitar" onChange={(e) => setBgColor(e.target.value)} />
                    <span className="est-badge">{bgColor}</span>
                  </div>
                </Field>
                <Slider label="Tolerancia" value={tolerance} min={2} max={140} onChange={(v) => setTolerance(v)} />
                <Slider label="Suavizado del borde" value={softness} min={0} max={120} onChange={(v) => setSoftness(v)} />
                {bgMode === 'borde' ? <Toggle label="Invertir la selección" checked={invertMask} onChange={setInvertMask} /> : null}
                <button
                  type="button"
                  className="btn-brutal min-h-[44px]"
                  onClick={() => {
                    const layer = selectedLayer;
                    if (!layer || layer.type !== 'image') {
                      showToast('Selecciona una capa de imagen');
                      return;
                    }
                    const src = sourcesRef.current.get(layer.srcId ?? '');
                    const color = src
                      ? readPixel(
                          src,
                          project.width / 2 + layer.x,
                          project.height / 2 + layer.y,
                          layer.x,
                          layer.y,
                          layer.scale,
                          project.width,
                          project.height,
                        )
                      : { r: 0, g: 0, b: 0 };
                    runBackgroundRemoval(bgMode, color, { x: 0, y: 0 });
                  }}
                >
                  Quitar fondo (básico)
                </button>
                <button type="button" className="est-chip" onClick={() => setTool('fondo')}>
                  Elegir el fondo en el lienzo
                </button>
              </>
            ) : null}

            {panelTab === 'texto' ? (
              selectedLayer && selectedLayer.type === 'text' ? (
                <>
                  <Field label="Texto">
                    <textarea
                      className="input-brutal min-h-20"
                      rows={2}
                      value={selectedLayer.text ?? ''}
                      aria-label="Texto de la capa"
                      onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })}
                    />
                  </Field>
                  <Field label="Tipografía">
                    <select
                      className="input-brutal"
                      value={selectedLayer.fontFamily}
                      aria-label="Tipografía"
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, {
                          fontFamily: e.target.value as 'Inter Tight' | 'Lexend',
                        })
                      }
                    >
                      <option value="Lexend">Lexend</option>
                      <option value="Inter Tight">Inter Tight</option>
                    </select>
                  </Field>
                  <Slider
                    label="Tamaño"
                    value={selectedLayer.fontSize ?? 64}
                    min={12}
                    max={260}
                    unit="px"
                    onChange={(v) => updateLayer(selectedLayer.id, { fontSize: v }, false)}
                  />
                  <Slider
                    label="Grosor"
                    value={selectedLayer.fontWeight ?? 700}
                    min={300}
                    max={800}
                    step={100}
                    onChange={(v) => updateLayer(selectedLayer.id, { fontWeight: v }, false)}
                  />
                  <Field label="Color">
                    <input
                      type="color"
                      value={selectedLayer.fontColor ?? '#fffff3'}
                      aria-label="Color del texto"
                      onChange={(e) => updateLayer(selectedLayer.id, { fontColor: e.target.value })}
                    />
                  </Field>
                  <Field label="Alineación">
                    <select
                      className="input-brutal"
                      value={selectedLayer.align ?? 'center'}
                      aria-label="Alineación del texto"
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, { align: e.target.value as 'left' | 'center' | 'right' })
                      }
                    >
                      <option value="left">Izquierda</option>
                      <option value="center">Centro</option>
                      <option value="right">Derecha</option>
                    </select>
                  </Field>
                  <Slider
                    label="Espaciado"
                    value={selectedLayer.letterSpacing ?? 0}
                    min={-10}
                    max={40}
                    unit="px"
                    onChange={(v) => updateLayer(selectedLayer.id, { letterSpacing: v }, false)}
                  />
                  <Slider
                    label="Posición X"
                    value={selectedLayer.x}
                    min={-700}
                    max={700}
                    unit="px"
                    onChange={(v) => updateLayer(selectedLayer.id, { x: v }, false)}
                  />
                  <Slider
                    label="Posición Y"
                    value={selectedLayer.y}
                    min={-700}
                    max={700}
                    unit="px"
                    onChange={(v) => updateLayer(selectedLayer.id, { y: v }, false)}
                  />
                  <Toggle
                    label="Sombra"
                    checked={selectedLayer.shadow ?? true}
                    onChange={(v) => updateLayer(selectedLayer.id, { shadow: v })}
                  />
                </>
              ) : (
                <>
                  <p className="est-muted">Selecciona una capa de texto o crea una nueva.</p>
                  <button type="button" className="btn-brutal min-h-[44px]" onClick={addTextLayer}>
                    Añadir texto
                  </button>
                </>
              )
            ) : null}
          </Panel>
        </div>
      </div>

      {exportOpen ? (
        <Modal
          title="Exportar imagen"
          subtitle="Se exporta en el tamaño del lienzo. Todo se procesa en este navegador."
          onClose={() => setExportOpen(false)}
        >
          <ExportPanel onExport={exportImage} onClose={() => setExportOpen(false)} />
        </Modal>
      ) : null}

      {toast ? <div className="est-toast">{toast}</div> : null}
    </div>
  );
}

function ExportPanel({
  onExport,
  onClose,
}: {
  onExport: (format: 'png' | 'jpeg' | 'webp', scale: number) => Promise<void>;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-3">
      <Field label="Formato">
        <div className="est-chip-row">
          {(
            [
              ['png', 'PNG'],
              ['jpeg', 'JPG'],
              ['webp', 'WebP'],
            ] as ['png' | 'jpeg' | 'webp', string][]
          ).map(([id, name]) => (
            <button key={id} type="button" className="est-chip" data-active={format === id} aria-pressed={format === id} onClick={() => setFormat(id)}>
              {name}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Escala">
        <div className="est-chip-row">
          {[1, 2].map((s) => (
            <button key={s} type="button" className="est-chip" data-active={scale === s} aria-pressed={scale === s} onClick={() => setScale(s)}>
              {s}×
            </button>
          ))}
        </div>
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost min-h-[44px]" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn-brutal min-h-[44px]"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onExport(format, scale);
            setBusy(false);
            onClose();
          }}
        >
          {busy ? 'Generando…' : 'Descargar imagen'}
        </button>
      </div>
    </div>
  );
}
