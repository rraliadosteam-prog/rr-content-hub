'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import {
  AJUSTES_INICIALES,
  PROPORCIONES,
  nombreEditado,
  pintarVersion,
  recorteParaProporcion,
  tamanoRotado,
  type Ajustes,
  type Proporcion,
} from '@/lib/edicion-foto';

type Props = {
  nombre: string;
  /** URL de la imagen original (un object URL o un data URL). */
  src: string;
  version: number;
  onCancelar: () => void;
  onGuardar: (blob: Blob, nombre: string) => void | Promise<void>;
};

/**
 * Editor de fotos DENTRO del hub.
 *
 * Todo ocurre en el navegador, sobre un canvas: no hay servicio de imágenes,
 * no hay cuentas de por medio y el archivo original nunca se toca. Lo que sale
 * de aquí es una versión nueva, con `_editado_vN` en el nombre.
 *
 * El video NO está aquí: va como «Próximamente». Un bucket que solo admite
 * imágenes no puede guardar el video final, así que un editor de video sería
 * una promesa que el hub no puede cumplir.
 */
export function EditorFoto({ nombre, src, version, onCancelar, onGuardar }: Props) {
  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const trabajoRef = useRef<HTMLCanvasElement | null>(null);
  const imagenRef = useRef<HTMLImageElement | null>(null);
  const [medidas, setMedidas] = useState<{ ancho: number; alto: number } | null>(null);
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_INICIALES);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    const imagen = new Image();
    imagen.onload = () => {
      if (!vivo) return;
      imagenRef.current = imagen;
      setMedidas({ ancho: imagen.naturalWidth, alto: imagen.naturalHeight });
      setCargando(false);
    };
    imagen.onerror = () => {
      if (!vivo) return;
      setError('No se pudo abrir la imagen.');
      setCargando(false);
    };
    imagen.src = src;
    return () => {
      vivo = false;
    };
  }, [src]);

  /** El recorte que corresponde a los ajustes actuales. */
  const recorte = useMemoRecorte(medidas, ajustes);

  const dibujar = useCallback(() => {
    const lienzo = lienzoRef.current;
    const imagen = imagenRef.current;
    if (!lienzo || !imagen || !medidas || !recorte) return;
    const rotada = tamanoRotado(medidas.ancho, medidas.alto, ajustes.rotacion);
    const caja = recorteParaProporcion(rotada, ajustes.proporcion);
    const maxLado = 520;
    const escala = Math.min(1, maxLado / Math.max(caja.ancho, caja.alto));
    const destino = { x: 0, y: 0, ancho: Math.round(caja.ancho * escala), alto: Math.round(caja.alto * escala) };
    lienzo.width = destino.ancho;
    lienzo.height = destino.alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return;
    if (!trabajoRef.current) trabajoRef.current = document.createElement('canvas');
    pintarVersion(ctx, imagen, medidas, ajustes, destino, trabajoRef.current);
  }, [ajustes, medidas, recorte]);

  useEffect(() => {
    dibujar();
  }, [dibujar]);

  function poner(parte: Partial<Ajustes>) {
    setAjustes((actual) => ({ ...actual, ...parte }));
  }

  function girar(grados: number) {
    setAjustes((actual) => ({ ...actual, rotacion: (((actual.rotacion + grados) % 360) + 360) % 360 }));
  }

  async function guardar() {
    const imagen = imagenRef.current;
    if (!imagen || !medidas || !recorte) return;
    setGuardando(true);
    setError('');
    try {
      const rotada = tamanoRotado(medidas.ancho, medidas.alto, ajustes.rotacion);
      const caja = recorteParaProporcion(rotada, ajustes.proporcion);
      const lienzo = document.createElement('canvas');
      lienzo.width = caja.ancho;
      lienzo.height = caja.alto;
      const ctx = lienzo.getContext('2d');
      if (!ctx) throw new Error('El navegador no dio contexto de dibujo.');
      const trabajo = document.createElement('canvas');
      pintarVersion(ctx, imagen, medidas, ajustes, { x: 0, y: 0, ancho: caja.ancho, alto: caja.alto }, trabajo);
      const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, 'image/png'));
      if (!blob) throw new Error('El navegador no pudo exportar la imagen.');
      await onGuardar(blob, nombreEditado(nombre, version));
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar la versión editada.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Editar ${nombre}`}
      data-testid="editor-foto"
      className="border border-blanco-20 bg-negro p-4 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-blanco-70">Edición de foto · dentro del hub</p>
          <h3 className="mt-2 break-words font-display text-xl font-bold text-blanco">{nombre}</h3>
          <p className="mt-1 font-mono text-xs text-blanco-60">
            {medidas ? `${medidas.ancho}×${medidas.alto} px` : 'Cargando…'}
            {recorte ? ` · recorte ${recorte.ancho}×${recorte.alto}` : ''}
          </p>
        </div>
        <button type="button" onClick={onCancelar} className="btn-ghost min-h-[44px] justify-center">
          Cerrar
        </button>
      </div>

      {cargando && (
        <p role="status" className="mt-4 text-sm text-blanco-70">
          Abriendo la foto…
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 border-l-4 border-mostaza bg-mostaza-10 px-4 py-3 text-sm text-mostaza">
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex items-center justify-center overflow-hidden border border-blanco-20 bg-negro-950 p-2">
          <canvas ref={lienzoRef} data-testid="editor-lienzo" className="max-h-[520px] max-w-full" />
        </div>

        <div className="space-y-5">
          <fieldset>
            <legend className="font-display text-sm font-bold uppercase tracking-tight text-blanco">
              Recorte
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PROPORCIONES.map((proporcion) => (
                <button
                  key={proporcion.id}
                  type="button"
                  data-testid={`editor-proporcion-${proporcion.id}`}
                  onClick={() => poner({ proporcion: proporcion.id as Proporcion })}
                  className={`min-h-[44px] border px-3 text-sm ${
                    ajustes.proporcion === proporcion.id
                      ? 'border-mostaza bg-mostaza-10 text-mostaza'
                      : 'border-blanco-30 text-blanco-80 hover:border-blanco'
                  }`}
                >
                  {proporcion.etiqueta}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-display text-sm font-bold uppercase tracking-tight text-blanco">
              Girar
            </legend>
            <div className="mt-2 flex gap-2">
              <button type="button" data-testid="editor-girar-izq" onClick={() => girar(-90)} className="btn-ghost min-h-[44px] justify-center">
                ↺ 90°
              </button>
              <button type="button" data-testid="editor-girar-der" onClick={() => girar(90)} className="btn-ghost min-h-[44px] justify-center">
                ↻ 90°
              </button>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-display text-sm font-bold uppercase tracking-tight text-blanco">
              Luz y color
            </legend>
            <EtiquetaAjuste
              etiqueta="Brillo"
              valor={ajustes.brillo}
              onChange={(valor) => poner({ brillo: valor })}
            />
            <EtiquetaAjuste
              etiqueta="Contraste"
              valor={ajustes.contraste}
              onChange={(valor) => poner({ contraste: valor })}
            />
            <EtiquetaAjuste
              etiqueta="Saturación"
              valor={ajustes.saturacion}
              onChange={(valor) => poner({ saturacion: valor })}
            />
            <label className="flex min-h-[44px] items-center gap-3 text-sm text-blanco-80">
              <input
                type="checkbox"
                data-testid="editor-grises"
                checked={ajustes.grises}
                onChange={(evento) => poner({ grises: evento.target.checked })}
                className="h-5 w-5 accent-mostaza"
              />
              Blanco y negro
            </label>
          </fieldset>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-testid="editor-guardar"
              onClick={guardar}
              disabled={guardando || cargando}
              className="btn-brutal inline-flex min-h-[44px] items-center justify-center gap-2 disabled:opacity-50"
            >
              <Icon name="check" size={16} />
              {guardando ? 'Guardando…' : 'Guardar versión editada'}
            </button>
            <button
              type="button"
              onClick={() => setAjustes(AJUSTES_INICIALES)}
              className="btn-ghost min-h-[44px] justify-center"
            >
              Volver al original
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EtiquetaAjuste({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: number;
  onChange: (valor: number) => void;
}) {
  return (
    <label className="block text-sm text-blanco-80">
      <span className="flex items-center justify-between">
        <span>{etiqueta}</span>
        <span className="font-mono text-xs text-blanco-60">{valor}%</span>
      </span>
      <input
        type="range"
        min={50}
        max={150}
        step={1}
        value={valor}
        aria-label={etiqueta}
        onChange={(evento) => onChange(Number.parseInt(evento.target.value, 10))}
        className="mt-2 w-full accent-mostaza"
      />
    </label>
  );
}

/** El recorte actual, sin meter un `useMemo` más arriba por claridad. */
function useMemoRecorte(medidas: { ancho: number; alto: number } | null, ajustes: Ajustes) {
  return useMemo(() => {
    if (!medidas) return null;
    const rotada = tamanoRotado(medidas.ancho, medidas.alto, ajustes.rotacion);
    return recorteParaProporcion(rotada, ajustes.proporcion);
  }, [medidas, ajustes.rotacion, ajustes.proporcion]);
}
