'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import {
  AVISO_CLIENTE_AJENO,
  AVISO_TODOS_VEN_TODO,
  ETIQUETAS_EVENTO,
  MENSAJE_LIMITE_BUCKET,
  clienteDeNombre,
  esDeOtroCliente,
  idDeMaterial,
  tamanoLegible,
  type EventoMaterialFila,
  type Material,
} from '@/lib/material';
import { MENSAJE_CREDENCIALES_PENDIENTES, type ArchivoDrive, type CuentaGoogle } from '@/lib/drive';
import { abrirPickerCarpeta, pedirTokenDrive, type CarpetaElegida } from '@/lib/drive-picker';
import {
  EDITOR_BRIDGE_VERSION,
  bytesComoUint8Array,
  crearNonceEditor,
  normalizarMensajeEditorGuardado,
  nombreVersionEditado,
  protocoloEditorListo,
  type EditorKind,
  type EditorProtocol,
  type EditorSaveMessage,
} from '@/lib/editor-bridge';

type Cliente = { slug: string; nombre: string };

type Props = {
  /** Cliente en el que está la persona ahora mismo. */
  cliente: string;
  nombreCliente: string;
  /** Todos los clientes: con esto se avisa de cuándo el archivo es de otro. */
  clientes: Cliente[];
  /** ¿Están la llave y el identificador de OAuth de Google? */
  credenciales: 'listo' | 'pendiente';
  apiKey: string;
  clientId: string;
  /** Enlace de la carpeta de Drive del equipo, como atajo. */
  carpetaEquipo: string;
  /** Lo que ya está en el registro de auditoría. */
  eventosIniciales: EventoMaterialFila[];
};

type Entrega = { enlace: string; vence: string; minutos: number; demo: boolean };

type EditorPendiente = {
  ventana: Window;
  editor: EditorKind;
  protocolo: EditorProtocol | null;
  nonce: string;
  archivo: ArchivoDrive;
  carpetaId: string;
  bytes: Promise<{ nombre: string; mimeType: string; bytes: ArrayBuffer }>;
};

function archivoSubidoParaLista(value: unknown): ArchivoDrive | null {
  if (!value || typeof value !== 'object') return null;
  const dato = value as Record<string, unknown>;
  const id = typeof dato.id === 'string' ? dato.id : '';
  const nombre = typeof dato.nombre === 'string' ? dato.nombre : '';
  const mimeType = typeof dato.mimeType === 'string' ? dato.mimeType : '';
  const carpetaId = typeof dato.carpetaId === 'string' ? dato.carpetaId : null;
  if (!id || !nombre || !mimeType || !carpetaId) return null;
  const tamano = typeof dato.tamano === 'number' && Number.isFinite(dato.tamano) ? dato.tamano : 0;
  return {
    id,
    nombre,
    mimeType,
    tamano,
    esImagen: mimeType.startsWith('image/'),
    esVideo: mimeType.startsWith('video/'),
    carpetaId,
    modificado: typeof dato.modificado === 'string' ? dato.modificado : new Date().toISOString(),
    miniatura: typeof dato.miniatura === 'string' ? dato.miniatura : null,
  };
}

/**
 * Material: la carpeta de Drive del equipo, los editores completos y la entrega.
 *
 * LO QUE SE VE AQUÍ
 *
 *   - La carpeta de Drive que elige cada persona (Google Picker, alcance
 *     `drive.file`). Se busca, se baja y se sube dentro de esa carpeta.
 *   - RR Imagen y RR Motion, servidos como aplicaciones completas del hub.
 *   - La entrega: solo la versión final, a almacenamiento privado, con un
 *     enlace firmado que vence. Los guardados del editor vuelven a Drive como
 *     versiones nuevas y no pisan el original.
 *   - El registro de quién subió, registró y entregó.
 *
 * LO QUE NO SE HACE
 *
 *   - No se borra nada de Drive. No hay botón de borrar y el proxy no tiene
 *     esa acción.
 *   - No se cambian permisos de Drive.
 *   - No se preselecciona ninguna cuenta de Google.
 */
export function MaterialPanel({
  cliente,
  nombreCliente,
  clientes,
  credenciales,
  apiKey,
  clientId,
  carpetaEquipo,
  eventosIniciales,
}: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState<CuentaGoogle | null>(null);
  const [carpeta, setCarpeta] = useState<CarpetaElegida | null>(null);
  const [carpetasDemo, setCarpetasDemo] = useState<{ id: string; nombre: string }[]>([]);
  const [verCarpetasDemo, setVerCarpetasDemo] = useState(false);
  const [archivos, setArchivos] = useState<ArchivoDrive[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [demo, setDemo] = useState(false);
  const [eventos, setEventos] = useState<EventoMaterialFila[]>(eventosIniciales);
  const [entregas, setEntregas] = useState<Record<string, Entrega>>({});
  const [registrados, setRegistrados] = useState<{ material: Material; blob: Blob }[]>([]);
  const [preview, setPreview] = useState<{ archivo: ArchivoDrive; url: string; mimeType: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewUrl = useRef<string | null>(null);
  const ventanasEditor = useRef(new Map<Window, EditorPendiente>());

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  const slugs = useMemo(() => clientes.map((c) => c.slug), [clientes]);

  const cabecera = useCallback(() => {
    const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) cabeceras.Authorization = `Bearer ${token}`;
    return cabeceras;
  }, [token]);

  /** El material se pide siempre con el token si lo hay. */
  const listar = useCallback(
    async (carpetaId: string, texto: string) => {
      setCargando(true);
      setError('');
      try {
        const respuesta = await fetch('/api/drive/listar', {
          method: 'POST',
          headers: cabecera(),
          body: JSON.stringify({ carpetaId, busqueda: texto }),
        });
        const datos = await respuesta.json();
        if (!respuesta.ok) {
          setError(datos?.error ?? 'No se pudo leer la carpeta de Drive.');
          return;
        }
        setArchivos(Array.isArray(datos.archivos) ? datos.archivos : []);
        setDemo(Boolean(datos.demo));
        if (datos.demo) {
          setAviso('Material de ejemplo: falta conectar Google. Las acciones siguen funcionando para probar el módulo.');
        }
      } catch {
        setError('No se pudo hablar con el servidor.');
      } finally {
        setCargando(false);
      }
    },
    [cabecera],
  );

  useEffect(() => {
    if (credenciales === 'listo') return;
    void fetch('/api/drive/carpetas')
      .then((r) => r.json())
      .then((datos) => {
        if (Array.isArray(datos?.carpetas)) setCarpetasDemo(datos.carpetas);
      })
      .catch(() => undefined);
  }, [credenciales]);

  /** Pedir el token de Google y abrir el Picker. */
  async function elegirCarpeta() {
    setError('');
    setAviso('');
    if (credenciales !== 'listo') {
      setVerCarpetasDemo((v) => !v);
      return;
    }
    try {
      const tokenNuevo = token ?? (await pedirTokenDrive(clientId));
      setToken(tokenNuevo);
      const elegida = await abrirPickerCarpeta({ apiKey, token: tokenNuevo });
      if (!elegida) return;
      setCarpeta(elegida);
      await listar(elegida.id, '');
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo elegir la carpeta.');
    }
  }

  /** Elige una de las carpetas de ejemplo (modo sin credenciales). */
  async function elegirCarpetaDemo(elegida: { id: string; nombre: string }) {
    setCarpeta(elegida);
    setVerCarpetasDemo(false);
    await listar(elegida.id, '');
  }

  async function buscar() {
    if (!carpeta) {
      setError('Primero elige una carpeta de Drive.');
      return;
    }
    await listar(carpeta.id, busqueda);
  }

  /**
   * Downloads only the selected file through the server proxy and keeps the
   * resulting object URL in memory. The Drive token stays in the Authorization
   * header and is never placed in a preview URL or browser storage.
   */
  async function previsualizar(archivo: ArchivoDrive) {
    setPreviewLoading(true);
    setError('');
    try {
      const respuesta = await fetch('/api/drive/bajar', {
        method: 'POST',
        headers: cabecera(),
        body: JSON.stringify({ archivoId: archivo.id }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok || typeof datos.bytes !== 'string' || !datos.bytes) {
        throw new Error(datos?.error ?? 'Drive no entregó el archivo para previsualizar.');
      }
      const mimeType = typeof datos.mimeType === 'string' && datos.mimeType ? datos.mimeType : archivo.mimeType;
      const url = URL.createObjectURL(new Blob([base64AArrayBuffer(datos.bytes)], { type: mimeType }));
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = url;
      setPreview({ archivo, url, mimeType });
      setAviso(`Previsualización lista: ${archivo.nombre}.`);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo previsualizar el archivo.');
    } finally {
      setPreviewLoading(false);
    }
  }

  function cerrarPreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  }

  /**
   * Opens the intact Craft application in a new tab and hands it the selected
   * Drive bytes only after the editor proves it is the expected same-origin
   * child. The Hub tab stays open and keeps the Drive token in memory.
   */
  function abrirEditor(archivo: ArchivoDrive) {
    setError('');
    const tipo = archivo.esVideo ? 'video' : 'foto';
    const editor: EditorKind = archivo.esVideo ? 'rr-motion' : 'rr-imagen';
    const nonce = crearNonceEditor();
    const ventana = window.open(`/${cliente}/editar/${tipo}`, nonce);
    if (!ventana) {
      setError('El navegador bloqueó la pestaña del editor. Permite ventanas emergentes para este hub.');
      return;
    }

    const bytes = (async () => {
      const respuesta = await fetch('/api/drive/bajar', {
        method: 'POST',
        headers: cabecera(),
        body: JSON.stringify({ archivoId: archivo.id }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok || typeof datos.bytes !== 'string' || !datos.bytes) {
        throw new Error(datos?.error ?? 'Drive no entregó los bytes del archivo.');
      }
      return {
        nombre: archivo.nombre,
        mimeType: typeof datos.mimeType === 'string' && datos.mimeType ? datos.mimeType : archivo.mimeType,
        bytes: base64AArrayBuffer(datos.bytes),
      };
    })();

    ventanasEditor.current.set(ventana, { ventana, editor, protocolo: null, nonce, archivo, carpetaId: carpeta?.id ?? '', bytes });
    void bytes.catch((fallo) => {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo bajar el archivo desde Drive.');
    });
    setAviso(`Abriendo ${archivo.nombre} en ${editor === 'rr-motion' ? 'RR Motion' : 'RR Imagen'}…`);
  }

  /** Entrega la versión final: almacenamiento privado y enlace que vence. */
  async function entregar(material: Material, blob: Blob) {
    setError('');
    try {
      const respuesta = await fetch('/api/material/entregar', {
        method: 'POST',
        headers: cabecera(),
        body: JSON.stringify({
          material,
          bytes: await blobABase64(blob),
        }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        setError(datos?.error ?? 'No se pudo entregar la versión final.');
        return;
      }
      setEntregas((actual) => ({
        ...actual,
        [material.id]: { enlace: datos.enlace, vence: datos.vence, minutos: datos.minutos, demo: Boolean(datos.demo) },
      }));
      setAviso('Versión final entregada. El enlace vence; después hay que entregar de nuevo.');
      await refrescarRegistro();
    } catch {
      setError('No se pudo entregar la versión final.');
    }
  }

  /** Sube un archivo del equipo a la carpeta elegida de Drive. */
  async function subirArchivo(archivo: File) {
    if (!carpeta) {
      setError('Primero elige una carpeta de Drive.');
      return;
    }
    setCargando(true);
    setError('');
    try {
      const respuesta = await fetch('/api/drive/subir', {
        method: 'POST',
        headers: cabecera(),
        body: JSON.stringify({
          carpetaId: carpeta.id,
          nombre: archivo.name,
          mimeType: archivo.type || 'application/octet-stream',
          bytes: await archivoABase64(archivo),
        }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        setError(datos?.error ?? 'No se pudo subir el archivo.');
        return;
      }
      const material: Material = {
        id: idDeMaterial(),
        nombre: archivo.name,
        mimeType: archivo.type || 'application/octet-stream',
        tamano: archivo.size,
        cliente: clienteDeNombre(archivo.name, slugs),
        origen: 'drive',
        driveId: datos.archivo?.id ?? null,
        carpetaId: carpeta.id,
        esImagen: (archivo.type || '').startsWith('image/'),
        esVideo: (archivo.type || '').startsWith('video/'),
        persona: cuenta?.correo ?? null,
        fecha: new Date().toISOString(),
        entregado: false,
      };
      await fetch('/api/material/registrar', {
        method: 'POST',
        headers: cabecera(),
        body: JSON.stringify({ evento: 'subida', material }),
      });
      setAviso(`«${archivo.name}» quedó en la carpeta de Drive.`);
      await refrescarRegistro();
      await listar(carpeta.id, busqueda);
    } catch {
      setError('No se pudo subir el archivo.');
    } finally {
      setCargando(false);
    }
  }

  const refrescarRegistro = useCallback(async () => {
    try {
      const respuesta = await fetch('/api/material/auditoria', { cache: 'no-store' });
      const datos = await respuesta.json();
      if (respuesta.ok && Array.isArray(datos.eventos)) setEventos(datos.eventos);
    } catch {
      /* Si el registro no responde, se conserva lo que ya había. */
    }
  }, []);

  const guardarSalidaEditor = useCallback(async (pendiente: EditorPendiente, mensaje: EditorSaveMessage) => {
    const bytes = bytesComoUint8Array(mensaje.bytes);
    const nombre = nombreVersionEditado(mensaje.nombre);
    const respuesta = await fetch('/api/drive/subir', {
      method: 'POST',
      headers: cabecera(),
      body: JSON.stringify({
        carpetaId: pendiente.carpetaId,
        nombre,
        mimeType: mensaje.mimeType,
        bytes: await bytesABase64(bytes),
      }),
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos?.error ?? 'No se pudo guardar la salida del editor en Drive.');

    const material: Material = {
      id: idDeMaterial(),
      nombre,
      mimeType: mensaje.mimeType,
      tamano: bytes.byteLength,
      cliente: clienteDeNombre(nombre, slugs),
      origen: 'drive',
      driveId: datos.archivo?.id ?? null,
      carpetaId: pendiente.carpetaId,
      esImagen: mensaje.mimeType.startsWith('image/'),
      esVideo: mensaje.mimeType.startsWith('video/'),
      persona: cuenta?.correo ?? null,
      fecha: new Date().toISOString(),
      entregado: false,
    };
    await fetch('/api/material/registrar', {
      method: 'POST',
      headers: cabecera(),
      body: JSON.stringify({ evento: 'registro', material }),
    });
    setAviso(`«${nombre}» quedó guardado como una nueva versión en Drive.`);
    try {
      const auditoria = await fetch('/api/material/auditoria', { cache: 'no-store' });
      const datosAuditoria = await auditoria.json();
      if (auditoria.ok && Array.isArray(datosAuditoria.eventos)) setEventos(datosAuditoria.eventos);
    } catch {
      /* La copia de Drive ya quedó hecha; se conserva el registro que había. */
    }
    await listar(pendiente.carpetaId, busqueda);
    const archivoSubido = archivoSubidoParaLista(datos.archivo);
    if (archivoSubido) {
      setArchivos((actuales) => actuales.some((actual) => actual.id === archivoSubido.id) ? actuales : [...actuales, archivoSubido]);
    }
    setAviso(`«${nombre}» quedó guardado como una nueva versión en Drive.`);
    pendiente.ventana.postMessage(
      { type: 'rr-editor-save-result', version: EDITOR_BRIDGE_VERSION, nonce: pendiente.nonce, ok: true, nombre },
      window.location.origin,
    );
  }, [busqueda, cabecera, cuenta?.correo, listar, slugs]);

  useEffect(() => {
    function recibirMensaje(evento: MessageEvent) {
      if (evento.origin !== window.location.origin) return;
      const source = evento.source as Window | null;
      if (!source) return;
      const pendiente = ventanasEditor.current.get(source);
      if (!pendiente) return;

      const protocolo = protocoloEditorListo(evento.data, pendiente.editor);
      if (protocolo) {
        pendiente.protocolo = protocolo;
        if (typeof evento.data.nonce === 'string') pendiente.nonce = evento.data.nonce;
        void pendiente.bytes
          .then(({ nombre, mimeType, bytes }) => {
            const transferible = bytes.slice(0);
            const mensaje = protocolo === 'filmcraft'
              ? {
                  type: 'filmcraft:open',
                  name: nombre,
                  filename: nombre,
                  mime: mimeType,
                  nonce: pendiente.nonce,
                  bytes: transferible,
                }
              : {
                  protocol: 'rr-editor-bridge',
                  type: 'rr-editor-open',
                  version: EDITOR_BRIDGE_VERSION,
                  editor: pendiente.editor,
                  nonce: pendiente.nonce,
                  filename: nombre,
                  mime: mimeType,
                  nombre,
                  mimeType,
                  bytes: transferible,
                };
            pendiente.ventana.postMessage(mensaje, window.location.origin, [transferible]);
            setAviso(`«${nombre}» cargado en ${pendiente.editor === 'rr-motion' ? 'RR Motion' : 'RR Imagen'}.`);
          })
          .catch((fallo) => {
            setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el archivo en el editor.');
          });
        return;
      }

      if (!pendiente.protocolo) return;
      const guardado = normalizarMensajeEditorGuardado(evento.data, pendiente.editor, pendiente.protocolo);
      if (guardado) {
        if (guardado.nonce !== pendiente.nonce) return;
        void guardarSalidaEditor(pendiente, guardado).catch((fallo) => {
          setError(fallo instanceof Error ? fallo.message : 'No se pudo persistir la salida del editor.');
          pendiente.ventana.postMessage(
            { type: 'rr-editor-save-result', version: EDITOR_BRIDGE_VERSION, nonce: pendiente.nonce, ok: false },
            window.location.origin,
          );
        });
      }
    }

    window.addEventListener('message', recibirMensaje);
    return () => window.removeEventListener('message', recibirMensaje);
  }, [guardarSalidaEditor]);

  return (
    <div data-modulo="material" className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:px-10 md:py-12">
      <header className="max-w-3xl">
        <p className="eyebrow text-blanco-70">Material · Drive · edición · entrega</p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-none tracking-tight text-blanco md:text-6xl">
          Material
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-blanco-80 md:text-lg md:leading-8">
          La carpeta de Drive que elijas, los editores profesionales completos del hub y
          la entrega de la versión final con un enlace que vence. Sin credenciales, con la
          cuenta personal de Google de cada persona.
        </p>
        <p
          role="note"
          data-testid="material-aviso-todos"
          className="mt-4 border-l-4 border-orquidea bg-blanco-05 px-4 py-4 text-sm leading-6 text-blanco-80"
        >
          {AVISO_TODOS_VEN_TODO}
        </p>
      </header>

      {error && (
        <p
          role="alert"
          data-testid="material-error"
          className="border-l-4 border-mostaza bg-mostaza-10 px-4 py-4 text-sm leading-6 text-mostaza"
        >
          {error}
        </p>
      )}
      {aviso && (
        <p
          role="status"
          data-testid="material-aviso"
          className="border-l-4 border-fucsia bg-blanco-05 px-4 py-4 text-sm leading-6 text-blanco-80"
        >
          {aviso}
        </p>
      )}

      <section aria-labelledby="material-drive" className="border border-blanco-20 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="material-drive" className="font-display text-2xl font-bold text-blanco">
              Carpeta de Drive
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-blanco-70">
              Google Picker con el alcance <span className="font-mono text-blanco">drive.file</span>:
              el hub solo ve los archivos de la carpeta que elijas. Nunca borra archivos ni
              cambia permisos.
            </p>
          </div>
          <button
            type="button"
            data-testid="material-elegir-carpeta"
            onClick={elegirCarpeta}
            className="btn-brutal inline-flex min-h-[44px] items-center justify-center gap-2"
          >
            <Icon name="folder" size={16} />
            Elegir carpeta en Drive
          </button>
        </div>

        {credenciales === 'pendiente' && (
          <p
            role="status"
            data-testid="material-credenciales-pendiente"
            className="mt-4 border-l-4 border-mostaza bg-mostaza-10 px-4 py-4 text-sm leading-6 text-mostaza"
          >
            {MENSAJE_CREDENCIALES_PENDIENTES}
          </p>
        )}

        {verCarpetasDemo && carpetasDemo.length > 0 && (
          <div data-testid="material-carpetas-demo" className="mt-4 border border-blanco-20 p-4">
            <p className="font-display text-sm font-bold uppercase tracking-tight text-blanco">
              Carpetas de ejemplo
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {carpetasDemo.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    data-testid={`material-carpeta-demo-${c.id}`}
                    onClick={() => void elegirCarpetaDemo(c)}
                    className="min-h-[44px] w-full border border-blanco-30 px-3 text-left text-sm text-blanco-80 hover:border-blanco"
                  >
                    {c.nombre}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {carpeta ? (
            <span
              data-testid="material-carpeta-elegida"
              className="inline-flex min-h-[44px] items-center gap-2 border border-fucsia px-3 font-mono text-xs text-blanco"
            >
              <Icon name="folder" size={14} />
              {carpeta.nombre}
            </span>
          ) : (
            <span className="font-mono text-xs text-blanco-60">SIN CARPETA ELEGIDA</span>
          )}
          {cuenta && (
            <span data-testid="material-cuenta" className="font-mono text-xs text-blanco-60">
              cuenta de Google: {cuenta.correo}
            </span>
          )}
          {demo && (
            <span data-testid="material-demo" className="font-mono text-xs text-mostaza">
              MODO EJEMPLO
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Buscar en la carpeta de Drive</span>
            <input
              type="search"
              value={busqueda}
              data-testid="material-buscar"
              onChange={(evento) => setBusqueda(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter') {
                  evento.preventDefault();
                  void buscar();
                }
              }}
              placeholder="Buscar por nombre…"
              className="input-brutal w-full"
            />
          </label>
          <button type="button" onClick={() => void buscar()} className="btn-ghost min-h-[44px] justify-center">
            Buscar
          </button>
          <label className="btn-ghost inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2">
            <Icon name="upload" size={16} />
            Subir a la carpeta
            <input
              type="file"
              data-testid="material-subir"
              className="sr-only"
              onChange={(evento) => {
                const archivo = evento.target.files?.[0];
                evento.target.value = '';
                if (archivo) void subirArchivo(archivo);
              }}
            />
          </label>
        </div>

        {carpetaEquipo && (
          <a
            href={carpetaEquipo}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-[44px] items-center font-mono text-xs text-mostaza underline-offset-4 hover:underline"
          >
            Abrir la carpeta del equipo en Drive
            <span className="sr-only">, se abre en una pestaña nueva</span>
          </a>
        )}
      </section>

      <section aria-labelledby="material-archivos" className="border border-blanco-20 p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="material-archivos" className="font-display text-2xl font-bold text-blanco">
            Archivos
          </h2>
          <span className="font-mono text-[10px] text-blanco-60">
            {archivos.length} ARCHIVOS {cargando ? '· BUSCANDO…' : ''}
          </span>
        </div>

        {preview && (
          <section
            data-testid={`material-preview-${preview.archivo.id}`}
            aria-label={`Previsualización de ${preview.archivo.nombre}`}
            className="mt-5 border border-fucsia bg-negro p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mono-label text-fucsia">// PREVISUALIZACIÓN</p>
                <p className="mt-1 break-words text-sm font-bold text-blanco">{preview.archivo.nombre}</p>
              </div>
              <button type="button" onClick={cerrarPreview} className="btn-ghost min-h-[44px] justify-center">
                Cerrar preview
              </button>
            </div>
            <div className="mt-4 overflow-hidden border border-blanco-20 bg-negro">
              {preview.archivo.esVideo ? (
                <video
                  controls
                  preload="metadata"
                  src={preview.url}
                  className="mx-auto max-h-[520px] w-full bg-negro object-contain"
                  aria-label={`Video ${preview.archivo.nombre}`}
                />
              ) : (
                <img
                  src={preview.url}
                  alt={`Previsualización de ${preview.archivo.nombre}`}
                  className="mx-auto max-h-[520px] w-full object-contain"
                />
              )}
            </div>
          </section>
        )}

        {archivos.length === 0 ? (
          <p className="mt-5 text-sm leading-6 text-blanco-70">
            {carpeta
              ? 'No hay archivos que coincidan con la búsqueda.'
              : 'Elige una carpeta de Drive para ver sus archivos.'}
          </p>
        ) : (
          <ul data-testid="material-lista" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {archivos.map((archivo) => {
              const clienteArchivo = clienteDeNombre(archivo.nombre, slugs);
              const ajeno = esDeOtroCliente({ cliente: clienteArchivo }, cliente);
              return (
                <li key={archivo.id} className="flex flex-col gap-3 border border-blanco-20 bg-negro p-4">
                  <div className="flex items-start gap-2">
                    <Icon name={archivo.esVideo ? 'video' : 'image'} size={16} className="mt-1 shrink-0 text-mostaza" />
                    <p className="min-w-0 break-words text-sm font-bold leading-5 text-blanco">{archivo.nombre}</p>
                  </div>
                  <p className="font-mono text-[11px] text-blanco-60">
                    {tamanoLegible(archivo.tamano)} · {archivo.mimeType || 'sin tipo'}
                  </p>
                  {ajeno && (
                    <p
                      data-testid={`material-ajeno-${archivo.id}`}
                      className="border-l-4 border-mostaza bg-mostaza-10 px-3 py-2 text-xs leading-5 text-mostaza"
                    >
                      {AVISO_CLIENTE_AJENO}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid={`material-preview-button-${archivo.id}`}
                      onClick={() => void previsualizar(archivo)}
                      disabled={previewLoading}
                      className="btn-ghost min-h-[44px] justify-center"
                    >
                      {previewLoading ? 'Cargando preview…' : 'Ver preview'}
                    </button>
                    {archivo.esVideo ? (
                      <button
                        type="button"
                        data-testid={`material-editar-video-${archivo.id}`}
                        onClick={() => void abrirEditor(archivo)}
                        className="btn-ghost min-h-[44px] justify-center"
                      >
                        Editar video
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid={`material-editar-${archivo.id}`}
                        onClick={() => void abrirEditor(archivo)}
                        className="btn-ghost min-h-[44px] justify-center"
                      >
                        Editar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="material-entrega" className="border border-blanco-20 p-5 md:p-6">
        <h2 id="material-entrega" className="font-display text-2xl font-bold text-blanco">
          Entrega
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-blanco-70">
          Solo la versión final se copia al almacenamiento privado, y se entrega con un
          enlace firmado que vence. Los borradores y las versiones a medio editar no se
          entregan.
        </p>
        <p
          role="note"
          data-testid="material-limite-bucket"
          className="mt-4 border-l-4 border-orquidea bg-blanco-05 px-4 py-4 text-sm leading-6 text-blanco-80"
        >
          {MENSAJE_LIMITE_BUCKET}
        </p>

        {registrados.length === 0 && eventos.length === 0 ? (
          <p className="mt-5 text-sm leading-6 text-blanco-70">
            Todavía no hay entregas registradas. Importa el archivo final y entrégalo desde aquí.
          </p>
        ) : (
          <ul className="mt-5 grid gap-3">
            {registrados.map(({ material, blob }) => (
              <li key={material.id} className="border border-blanco-20 p-4">
                <p className="font-display text-sm font-bold text-blanco">{material.nombre}</p>
                <p className="mt-1 font-mono text-[11px] text-blanco-60">
                  {tamanoLegible(material.tamano)} · {material.cliente ?? 'sin cliente'} · versión final
                </p>
                {esDeOtroCliente(material, cliente) && (
                  <p className="mt-3 border-l-4 border-mostaza bg-mostaza-10 px-3 py-2 text-xs leading-5 text-mostaza">
                    {AVISO_CLIENTE_AJENO}
                  </p>
                )}
                {entregas[material.id] ? (
                  <p className="mt-3 break-all text-xs text-mostaza">
                    <a href={entregas[material.id].enlace} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                      {entregas[material.id].enlace}
                    </a>
                    <span className="mt-1 block text-blanco-60">
                      Vence en {entregas[material.id].minutos} minutos ({new Date(entregas[material.id].vence).toLocaleString('es-CO')}).
                      {entregas[material.id].demo ? ' Enlace de ejemplo: no abre un archivo real.' : ''}
                    </span>
                  </p>
                ) : (
                  <button
                    type="button"
                    data-testid={`material-entregar-${material.id}`}
                    onClick={() => void entregar(material, blob)}
                    className="btn-brutal mt-3 inline-flex min-h-[44px] items-center justify-center gap-2"
                  >
                    <Icon name="upload" size={16} />
                    Entregar versión final
                  </button>
                )}
              </li>
            ))}
            {eventos
              .filter((evento) => evento.evento === 'entrega')
              .map((evento) => {
                const entrega = entregas[evento.materialId];
                return (
                  <li key={`${evento.id}-${evento.evento}`} className="border border-blanco-20 p-4">
                    <p className="font-display text-sm font-bold text-blanco">{evento.nombre}</p>
                    <p className="mt-1 font-mono text-[11px] text-blanco-60">
                      {evento.persona} · {evento.cuentaGoogle ?? 'sin cuenta de Google'} · {evento.at}
                    </p>
                    {entrega ? (
                      <p className="mt-3 break-all text-xs text-mostaza">
                        <a href={entrega.enlace} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                          {entrega.enlace}
                        </a>
                        <span className="mt-1 block text-blanco-60">
                          Vence en {entrega.minutos} minutos ({new Date(entrega.vence).toLocaleString('es-CO')}).
                        </span>
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-blanco-60">
                        El enlace no se guarda en el hub: se entrega en el momento y vence.
                      </p>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section aria-labelledby="material-registro" className="border border-blanco-20 p-5 md:p-6">
        <h2 id="material-registro" className="font-display text-2xl font-bold text-blanco">
          Registro de auditoría
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-blanco-70">
          Quién sube, quién registra y quién entrega. Queda escrito en el hub, con nombre
          y con la cuenta de Google con la que se tocó Drive.
        </p>
        {eventos.length === 0 ? (
          <p className="mt-5 text-sm leading-6 text-blanco-70">Todavía no hay movimientos.</p>
        ) : (
          <ul data-testid="material-registro" className="mt-5 divide-y divide-blanco-10 border-t border-blanco-10">
            {eventos.map((evento) => (
              <li key={`${evento.id}-${evento.evento}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <span className="font-display text-xs font-bold uppercase tracking-tight text-mostaza">
                  {ETIQUETAS_EVENTO[evento.evento]}
                </span>
                <span className="min-w-0 break-words text-sm text-blanco-80">{evento.nombre}</span>
                <span className="font-mono text-[11px] text-blanco-60">
                  {evento.persona}
                  {evento.cuentaGoogle ? ` · ${evento.cuentaGoogle}` : ''}
                  {evento.cliente ? ` · ${evento.cliente}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Convierte un blob en base64, sin reventar la pila con archivos grandes. */
async function blobABase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  const paso = 0x8000;
  for (let indice = 0; indice < bytes.length; indice += paso) {
    binario += String.fromCharCode(...bytes.subarray(indice, indice + paso));
  }
  return btoa(binario);
}

async function archivoABase64(archivo: File): Promise<string> {
  return blobABase64(archivo);
}

async function bytesABase64(bytes: Uint8Array): Promise<string> {
  let binario = '';
  const paso = 0x8000;
  for (let indice = 0; indice < bytes.length; indice += paso) {
    binario += String.fromCharCode(...bytes.subarray(indice, indice + paso));
  }
  return btoa(binario);
}

function base64AArrayBuffer(base64: string): ArrayBuffer {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let indice = 0; indice < binario.length; indice += 1) bytes[indice] = binario.charCodeAt(indice);
  return bytes.buffer;
}
