'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { updateIdea, type EditableIdea } from '@/lib/workspace-client';
import { Icon } from '@/components/ui/icons';

/**
 * Editar los datos de una pieza que ya existe.
 *
 * El hueco que tapaba esto: se podía crear una idea, moverla de fase, escribir
 * el guion, comentar y asignar responsable — pero no corregir un campo. Una idea
 * creada sin referencia se quedaba así para siempre, y en Wundeer eran 6 de 26.
 * Dos de ellas ya estaban en `approved` y `ready_to_publish`: a punto de salir sin
 * la referencia que su propio brief da por buena.
 *
 * El bloque sale pegado al hueco de la referencia, no escondido en un menú: si
 * falta la referencia, ahí es donde se llena.
 *
 * Reglas de la casa que se respetan aquí:
 * - Una sola acción primaria por superficie. Guardar es el botón de blanco.
 * - El aviso va ARRIBA del formulario, con borde. Un error que se pinta debajo
 *   de ocho campos es un "le doy y no pasa nada".
 * - Cero esquinas redondeadas, mono para los metadatos, nada bajo 10 px.
 */
export function IdeaEditor({
  ideaId,
  role,
  initial,
}: {
  ideaId: string;
  role: string;
  initial: {
    title?: string | null;
    description?: string | null;
    objective?: string | null;
    camera?: string | null;
    talent?: string | null;
    edit?: string | null;
    references: string[];
    publishedUrl?: string | null;
    metrics?: { alcance?: number | null; interacciones?: number | null; conversiones?: number | null; nota?: string | null };
  };
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState('');

  const [titulo, setTitulo] = useState(initial.title ?? '');
  const [descripcion, setDescripcion] = useState(initial.description ?? '');
  const [objetivo, setObjetivo] = useState(initial.objective ?? '');
  const [camara, setCamara] = useState(initial.camera ?? '');
  const [talento, setTalento] = useState(initial.talent ?? '');
  const [edicion, setEdicion] = useState(initial.edit ?? '');
  const [referencia, setReferencia] = useState(initial.references[0] ?? '');
  const [publishedUrl, setPublishedUrl] = useState(initial.publishedUrl ?? '');
  const [alcance, setAlcance] = useState(initial.metrics?.alcance?.toString() ?? '');
  const [interacciones, setInteracciones] = useState(initial.metrics?.interacciones?.toString() ?? '');
  const [conversiones, setConversiones] = useState(initial.metrics?.conversiones?.toString() ?? '');
  const [notaMetricas, setNotaMetricas] = useState(initial.metrics?.nota ?? '');

  const soloLectura = role === 'client_viewer';
  const sinReferencia = initial.references.length === 0;

  const cerrar = useCallback(() => {
    setAbierto(false);
    setError('');
  }, []);

  const guardar = useCallback(async () => {
    setError('');
    setGuardado('');

    // La URL se comprueba aquí para no gastar un viaje si está mal, pero la
    // validación que manda es la del servidor: esta es cortesía, no seguridad.
    const url = referencia.trim();
    if (url) {
      let parseada: URL;
      try {
        parseada = new URL(url);
      } catch {
        setError('La dirección de la referencia no es válida. Copia el link completo, incluido el https://.');
        return;
      }
      if (parseada.protocol !== 'http:' && parseada.protocol !== 'https:') {
        setError('Solo se aceptan direcciones http o https.');
        return;
      }
    }

    if (!titulo.trim()) {
      setError('El título no puede quedar vacío.');
      return;
    }

    // Solo se manda lo que cambió. Si se mandara todo, un campo vacío borraría
    // el dato que ya estaba bien.
    const cambios: EditableIdea = { referenceUrls: url ? [url] : [] };
    if (titulo !== (initial.title ?? '')) cambios.title = titulo;
    if (descripcion !== (initial.description ?? '')) cambios.description = descripcion;
    if (objetivo !== (initial.objective ?? '')) cambios.objective = objetivo;
    if (camara !== (initial.camera ?? '')) cambios.cameraBrief = camara;
    if (talento !== (initial.talent ?? '')) cambios.talentBrief = talento;
    if (edicion !== (initial.edit ?? '')) cambios.editBrief = edicion;
    if (publishedUrl !== (initial.publishedUrl ?? '')) cambios.publishedUrl = publishedUrl || null;
    const metricas = {
      alcance: alcance === '' ? null : Number(alcance),
      interacciones: interacciones === '' ? null : Number(interacciones),
      conversiones: conversiones === '' ? null : Number(conversiones),
      nota: notaMetricas || null,
    };
    const metricasIniciales = initial.metrics ?? {};
    if (JSON.stringify(metricas) !== JSON.stringify({
      alcance: metricasIniciales.alcance ?? null,
      interacciones: metricasIniciales.interacciones ?? null,
      conversiones: metricasIniciales.conversiones ?? null,
      nota: metricasIniciales.nota ?? null,
    })) cambios.metrics = metricas;

    setGuardando(true);
    const { error: fallo, actualizado } = await updateIdea(ideaId, cambios);
    setGuardando(false);

    if (fallo) {
      setError(fallo);
      return;
    }

    const n = actualizado?.length ?? 0;
    setGuardado(`✓ Guardado. ${n} ${n === 1 ? 'campo corregido' : 'campos corregidos'}.`);
    // Se deja abierto para que se vea el resultado; la recarga del servidor
    // pone el embed y los textos al día.
    setTimeout(() => router.refresh(), 1200);
  }, [titulo, descripcion, objetivo, camara, talento, edicion, referencia, publishedUrl, alcance, interacciones, conversiones, notaMetricas, ideaId, initial, router]);

  if (soloLectura) {
    return (
      <div className="border border-blanco-20 p-5">
        <p className="mono-label text-blanco-50">[EDITAR PIEZA]</p>
        <p className="mt-3 text-sm leading-6 text-blanco-60">
          Tu rol es de lectura: puedes consultar la pieza pero no corregir sus datos.
        </p>
      </div>
    );
  }

  if (!abierto) {
    return (
      <div className="border border-blanco-20 p-5 anim-rise">
        <p className="mono-label text-blanco-50">[EDITAR PIEZA]</p>
        <p className="mt-3 text-sm leading-6 text-blanco-60">
          {sinReferencia
            ? 'A esta pieza le falta la referencia visual. El brief da por hecho que el equipo la tiene.'
            : 'Corrige el título, el brief o cambia la referencia por otra.'}
        </p>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="btn-brutal mt-4 inline-flex items-center gap-2 text-xs"
        >
          <Icon name="pen" size={14} />
          {sinReferencia ? 'AÑADIR REFERENCIA' : 'EDITAR DATOS'}
        </button>
      </div>
    );
  }

  return (
    <section className="border border-blanco-30 bg-blanco-05 p-5 sm:p-7 anim-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mono-label text-blanco-50">[EDITAR PIEZA]</p>
          <h2 className="mt-2 font-display text-xl font-bold text-blanco sm:text-2xl">
            Corregir los datos.
          </h2>
        </div>
        <button
          type="button"
          onClick={cerrar}
          className="shrink-0 border border-blanco-20 px-2 py-1 font-mono text-[10px] text-blanco-60 hover:border-blanco-40 hover:text-blanco"
        >
          CERRAR
        </button>
      </div>

      {/* El aviso va arriba, no abajo. Un error pintado debajo de siete campos
          es un "le doy a guardar y no pasa nada". */}
      <div aria-live="polite">
        {error && (
          <p
            id="aviso-editar"
            role="alert"
            className="mt-5 border-l-4 border-mostaza bg-mostaza-10 p-3 text-sm leading-6 text-blanco"
          >
            {error}
          </p>
        )}
        {guardado && (
          <p className="mt-5 border-l-4 border-orquidea bg-orquidea-10 p-3 text-sm leading-6 text-blanco">
            {guardado}
          </p>
        )}
      </div>

      <div className="mt-6 space-y-5">
        {/* La referencia va PRIMERA. Es lo que más falta y lo que la hizo
            inalcanzable hasta ahora. */}
        <div>
          <label htmlFor="edit-referencia" className="mono-label text-blanco-60">
            // REFERENCIA VISUAL (LINK DE LA PLATAFORMA)
          </label>
          <input
            id="edit-referencia"
            type="url"
            inputMode="url"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="https://www.instagram.com/reel/… o el link de Drive"
            className="mt-2 w-full border border-blanco-30 bg-negro p-3 font-mono text-xs text-blanco placeholder:text-blanco-30 focus:border-fucsia focus:outline-none"
          />
          <p className="mt-2 font-mono text-[10px] leading-5 text-blanco-40">
            Con el link, la ficha muestra el video real y se arma el brief de cámara,
            talento y edición. Sin él, el brief dice &laquo;sigue la referencia&raquo; y no hay
            referencia que seguir.
          </p>
        </div>

        <div>
          <label htmlFor="edit-titulo" className="mono-label text-blanco-60">
            // TÍTULO
          </label>
          <input
            id="edit-titulo"
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="mt-2 w-full border border-blanco-30 bg-negro p-3 font-mono text-xs text-blanco focus:border-fucsia focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="edit-descripcion" className="mono-label text-blanco-60">
            // DESCRIPCIÓN
          </label>
          <textarea
            id="edit-descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-none border border-blanco-30 bg-negro p-3 font-mono text-xs leading-6 text-blanco focus:border-fucsia focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="edit-objetivo" className="mono-label text-blanco-60">
            // OBJETIVO
          </label>
          <textarea
            id="edit-objetivo"
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            rows={2}
            className="mt-2 w-full resize-none border border-blanco-30 bg-negro p-3 font-mono text-xs leading-6 text-blanco focus:border-fucsia focus:outline-none"
          />
        </div>

        {/* El brief, en su propia caja porque son tres campos que se leen juntos. */}
        <fieldset className="border border-blanco-20 p-4">
          <legend className="mono-label px-2 text-blanco-60">// BRIEF VISUAL</legend>
          <div className="mt-2 space-y-4">
            {([
              ['CÁMARA', camara, setCamara, 'edit-camara'],
              ['TALENTO', talento, setTalento, 'edit-talento'],
              ['EDICIÓN', edicion, setEdicion, 'edit-edicion'],
            ] as const).map(([etiqueta, valor, cambiar, id]) => (
              <div key={id}>
                <label htmlFor={id} className="mono-label text-blanco-50">
                  {'// '}
                  {etiqueta}
                </label>
                <textarea
                  id={id}
                  value={valor}
                  onChange={(e) => cambiar(e.target.value)}
                  rows={2}
                  className="mt-2 w-full resize-none border border-blanco-30 bg-negro p-3 font-mono text-xs leading-6 text-blanco focus:border-fucsia focus:outline-none"
                />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="border border-blanco-20 p-4">
          <legend className="mono-label px-2 text-blanco-60">// PUBLICACIÓN Y RESULTADOS</legend>
          <p className="mt-2 text-xs leading-5 text-blanco-50">Pega el enlace de la publicación y registra los resultados que RR o el cliente hayan confirmado. Solo las personas con acceso a este cliente los pueden ver.</p>
          <label htmlFor="edit-publicada" className="mono-label mt-4 block text-blanco-50">ENLACE PUBLICADO</label>
          <input id="edit-publicada" type="url" value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} placeholder="https://instagram.com/..." className="mt-2 w-full border border-blanco-30 bg-negro p-3 font-mono text-xs text-blanco focus:border-fucsia focus:outline-none" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {([['edit-alcance', 'ALCANCE', alcance, setAlcance], ['edit-interacciones', 'INTERACCIONES', interacciones, setInteracciones], ['edit-conversiones', 'CONVERSIONES', conversiones, setConversiones] ] as const).map(([id, label, value, setValue]) => (
              <label key={id} htmlFor={id} className="font-mono text-[10px] text-blanco-50">{label}<input id={id} type="number" min="0" step="1" value={value} onChange={(e) => setValue(e.target.value)} className="mt-2 w-full border border-blanco-30 bg-negro p-3 text-sm text-blanco focus:border-fucsia focus:outline-none" /></label>
            ))}
          </div>
          <label htmlFor="edit-nota-metricas" className="mono-label mt-4 block text-blanco-50">NOTA / FUENTE</label>
          <textarea id="edit-nota-metricas" value={notaMetricas} onChange={(e) => setNotaMetricas(e.target.value)} rows={2} placeholder="Ej. Meta Ads · corte 22 nov" className="mt-2 w-full resize-none border border-blanco-30 bg-negro p-3 font-mono text-xs leading-6 text-blanco focus:border-fucsia focus:outline-none" />
        </fieldset>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] text-blanco-40">SOLO SE GUARDA LO QUE CAMBIAS</span>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="btn-brutal shrink-0 text-xs"
        >
          {guardando ? 'GUARDANDO…' : 'GUARDAR CAMBIOS →'}
        </button>
      </div>
    </section>
  );
}
