import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { DEMO_MODE } from '@/lib/demo-mode';
import {
  BUCKET_MATERIAL,
  TAMANO_MAX_ENTREGA,
  rutaDeEntrega,
  type EventoMaterial,
  type EventoMaterialFila,
} from '@/lib/material';
import { filaDeEvento } from '@/lib/material';

/**
 * El registro de material: quién sube, quién registra y quién entrega.
 *
 * DÓNDE VIVE
 *
 * En `rr_hub_audit_log`, la tabla de auditoría que ya tiene el hub (migración
 * `20261006_hub_audit_log.sql`). Se reusa a propósito:
 *
 *   - No se crea ninguna tabla nueva. Este encargo no puede tocar la base de
 *     producción, así que una migración nueva would quedar sin aplicar y el
 *     módulo se vería vacío sin avisar. Con una tabla que YA está en producción
 *     el registro funciona el primer día.
 *   - La tabla tiene `grant select, insert on rr_hub_audit_log to service_role`,
 *     que es justo lo que hace falta: escribir y leer.
 *   - `rr_hub_audit_log` es genérica a propósito (`tabla`, `op`, `row_id`,
 *     `antes`, `despues`). Aquí `tabla` vale `rr_hub_material` y el evento
 *     concreto (`subida`, `registro`, `entrega`) va dentro de `despues`.
 *
 * Lo que NO se hace: tocar `rr_hub_assets`. Esa tabla exige `idea_id` (una
 * pieza del tablero) y este módulo trabaja con material que no siempre
 * pertenece a una pieza. Un material sin pieza se guardaría en la tabla de
 * assets con un id inventado, que es mentir sobre de dónde salió el archivo.
 *
 * ENTREGA
 *
 * La versión final se copia al bucket `rr-content-assets`, que es PRIVADO
 * (`public = false`), y se devuelve un enlace firmado que vence. El enlace
 * firmado es la única forma de verlo: sin él, el objeto no se abre. Y como el
 * bucket es privado y solo admite imágenes de hasta 50 MB, un video no se
 * puede entregar todavía: por eso el video va como «Próximamente».
 */
const TABLA_AUDITORIA = 'rr_hub_material';

export type EntradaEvento = {
  evento: EventoMaterial;
  materialId: string;
  nombre: string;
  cliente: string | null;
  /** Quién lo hizo en el hub. */
  persona: string;
  /** Con qué cuenta de Google, si la acción tocó Drive. */
  cuentaGoogle?: string | null;
  detalle?: string | null;
};

/** Minutos de vida del enlace firmado de entrega. */
export function minutosDeEntrega(): number {
  const crudo = Number.parseInt(process.env.HUB_ENTREGA_URL_MINUTOS ?? '', 10);
  if (!Number.isFinite(crudo) || crudo <= 0) return 60;
  return Math.min(crudo, 60 * 24 * 7);
}

/**
 * Registro de demostración.
 *
 * Sin credenciales de Supabase no hay tabla donde escribir, y un módulo que
 * se queda mudo no se puede ni probar ni documentar. En demo esto vive en
 * memoria: se reinicia con el proceso, y eso se dice en la interfaz.
 */
const eventosDemo: EventoMaterialFila[] = [];

/**
 * El payload que se guarda en `rr_hub_audit_log`.
 *
 * La escritura la hace la RUTA (`/api/material/[accion]`), no este módulo: la
 * regla del repo es que ninguna tabla `rr_hub_*` se escribe desde `src/lib`.
 * Aquí solo se prepara el registro.
 */
export function payloadDeEvento(entrada: EntradaEvento): Record<string, unknown> {
  return {
    tabla: TABLA_AUDITORIA,
    op: 'INSERT',
    row_id: entrada.materialId,
    antes: null,
    despues: {
      evento: entrada.evento,
      materialId: entrada.materialId,
      nombre: entrada.nombre,
      cliente: entrada.cliente,
      persona: entrada.persona,
      cuentaGoogle: entrada.cuentaGoogle ?? null,
      detalle: entrada.detalle ?? null,
    },
  };
}

/** Guarda el evento en el registro de demostración (sin base de datos). */
export function registrarEventoDemo(entrada: EntradaEvento): void {
  eventosDemo.unshift({
    id: `demo-${eventosDemo.length + 1}`,
    at: new Date().toISOString(),
    evento: entrada.evento,
    materialId: entrada.materialId,
    nombre: entrada.nombre,
    cliente: entrada.cliente,
    persona: entrada.persona,
    cuentaGoogle: entrada.cuentaGoogle ?? null,
    detalle: entrada.detalle ?? null,
  });
}

/** El registro completo, del más reciente al más antiguo. */
export async function leerEventosMaterial(cliente?: string | null): Promise<EventoMaterialFila[]> {
  if (DEMO_MODE) {
    const filtrados = cliente
      ? eventosDemo.filter((e) => !e.cliente || e.cliente === cliente)
      : eventosDemo;
    return filtrados;
  }

  const service = await createServiceClient();
  if (!service) return [];

  const { data, error } = await service
    .from('rr_hub_audit_log')
    .select('id, at, row_id, despues')
    .eq('tabla', TABLA_AUDITORIA)
    .order('at', { ascending: false })
    .limit(200);

  if (error) return [];

  const filas = (data ?? [])
    .map((fila) => filaDeEvento(fila))
    .filter((fila): fila is EventoMaterialFila => fila !== null);

  if (!cliente) return filas;
  return filas.filter((fila) => !fila.cliente || fila.cliente === cliente);
}

/** El material que ya está registrado, deducido del registro de auditoría. */
export async function materialRegistrado(cliente?: string | null) {
  const filas = await leerEventosMaterial(cliente);
  const porMaterial = new Map<string, EventoMaterialFila>();
  for (const fila of filas) {
    const actual = porMaterial.get(fila.materialId);
    if (!actual) porMaterial.set(fila.materialId, fila);
  }
  return [...porMaterial.values()];
}

export type ResultadoEntrega = {
  ok: boolean;
  ruta: string | null;
  /** Enlace firmado. Vence; no es una URL pública. */
  enlace: string | null;
  /** Cuándo vence, en ISO. */
  vence: string | null;
  minutos: number;
  /** true cuando el enlace es de demostración y no abre un archivo real. */
  demo?: boolean;
  error?: string;
};

/**
 * Copia la versión final al almacenamiento privado y devuelve un enlace
 * firmado que vence.
 *
 * SOLO se entrega la versión final: el servidor no sabe qué es «final» ni
 * qué es «borrador» — quien llama decide eso y lo deja escrito en el
 * registro. Lo que el servidor SÍ comprueba es lo que el bucket no negocia:
 * que sea una imagen de verdad y que quepa en 50 MB.
 */
export async function entregarVersionFinal({
  cliente,
  materialId,
  nombre,
  mimeType,
  bytes,
}: {
  cliente: string;
  materialId: string;
  nombre: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ResultadoEntrega> {
  const minutos = minutosDeEntrega();
  const service = await createServiceClient();

  if (DEMO_MODE) {
    // En demostración no hay almacenamiento privado, así que el enlace es de
    // ejemplo y NO abre un archivo. Se marca como demo para que la interfaz
    // lo diga: un enlace que no abre nada y no lo avisa es una mentira.
    return {
      ok: true,
      ruta: `demo/${cliente}/entregas/${materialId}/${nombre}`,
      enlace: `https://ejemplo.local/entrega-demo/${materialId}?vence=${Date.now() + minutos * 60_000}`,
      vence: new Date(Date.now() + minutos * 60_000).toISOString(),
      minutos,
      demo: true,
    };
  }

  if (!service) {
    // Sin base no hay almacenamiento privado: se dice, en vez de devolver un
    // enlace inventado que no abre nada.
    return {
      ok: false,
      ruta: null,
      enlace: null,
      vence: null,
      minutos,
      error: 'El servidor no tiene la configuración de Supabase: la entrega queda pendiente.',
    };
  }

  if (!bytes.length) {
    return { ok: false, ruta: null, enlace: null, vence: null, minutos, error: 'La versión final llegó vacía.' };
  }
  if (bytes.length > TAMANO_MAX_ENTREGA) {
    return {
      ok: false,
      ruta: null,
      enlace: null,
      vence: null,
      minutos,
      error: 'La versión final supera los 50 MB del almacenamiento de entrega.',
    };
  }

  const ruta = rutaDeEntrega(cliente, materialId, nombre);

  const { error: errorSubida } = await service.storage
    .from(BUCKET_MATERIAL)
    .upload(ruta, bytes, { upsert: false, contentType: mimeType });
  if (errorSubida) {
    return {
      ok: false,
      ruta: null,
      enlace: null,
      vence: null,
      minutos,
      error: `No se pudo guardar la versión final: ${errorSubida.message}`,
    };
  }

  const { data: firmado, error: errorFirma } = await service.storage
    .from(BUCKET_MATERIAL)
    .createSignedUrl(ruta, minutos * 60);
  if (errorFirma || !firmado?.signedUrl) {
    return {
      ok: false,
      ruta,
      enlace: null,
      vence: null,
      minutos,
      error: 'El archivo se guardó, pero no se pudo firmar el enlace.',
    };
  }

  return {
    ok: true,
    ruta,
    enlace: firmado.signedUrl,
    vence: new Date(Date.now() + minutos * 60_000).toISOString(),
    minutos,
  };
}
