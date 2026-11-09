/**
 * Material del hub: lo que el equipo produce con Flow y lo que se entrega.
 *
 * Este módulo es PURO: sin base de datos, sin red y sin navegador. Todo lo
 * que se puede decidir sin servidor (de quién es un archivo, cómo se avisa,
 * dónde se guarda la entrega) vive aquí para poder probarlo; lo que necesita
 * Supabase vive en `material-server.ts`.
 *
 * Tres ideas que el módulo deja claras:
 *
 *  1. TODO EL MATERIAL ES DE TODOS. Los editores ven el material de todos los
 *     clientes, sin excepciones. Lo que cambia es el AVISO: cuando el archivo
 *     es de otro cliente, se dice. No se esconde, porque esconderlo sería
 *     mentir sobre lo que hay en la mesa.
 *
 *  2. SOLO LA VERSIÓN FINAL SE ENTREGA. Un borrador, una versión a medio
 *     editar o una foto de trabajo no van al almacenamiento privado. Lo que va
 *     es la versión final, y va con un enlace firmado que vence.
 *
 *  3. EL BUCKET TIENE LÍMITES. El bucket del hub (`rr-content-assets`) es
 *     PRIVADO, admite SOLO imágenes y pesa como máximo 50 MB. Eso no es un
 *     detalle de implementación: es la razón por la que el video va como
 *     «Próximamente» y por la que la entrega de un video se rechaza con un
 *     mensaje claro en vez de fallar por dentro.
 */

export type OrigenMaterial = 'drive' | 'hub';

/** Los tres momentos que quedan en el registro de auditoría. */
export type EventoMaterial = 'subida' | 'registro' | 'entrega';

export const ETIQUETAS_EVENTO: Record<EventoMaterial, string> = {
  subida: 'Subió',
  registro: 'Registró',
  entrega: 'Entregó',
};

/** Texto de la etiqueta, con lo que hizo y con qué. */
export const ETIQUETAS_EVENTO_TXT: Record<EventoMaterial, string> = {
  subida: 'Subió el archivo',
  registro: 'Registró el archivo',
  entrega: 'Entregó la versión final',
};

/**
 * El aviso de cliente ajeno. Es el mismo texto en todas partes donde aparece,
 * para que la persona lo reconozca.
 */
export const AVISO_CLIENTE_AJENO =
  'Este archivo es de otro cliente. Todos los editores ven todo el material: revisa que sea el correcto antes de usarlo.';

export const AVISO_TODOS_VEN_TODO =
  'Todos los editores ven todo el material, de todos los clientes. Cuando el archivo es de otro cliente, aparece el aviso.';

/** El bucket del hub: privado, solo imágenes, 50 MB. */
export const BUCKET_MATERIAL = 'rr-content-assets';
export const TAMANO_MAX_ENTREGA = 50 * 1024 * 1024;

export const MENSAJE_LIMITE_BUCKET =
  'El almacenamiento de entrega es privado, admite solo imágenes y pesa hasta 50 MB. Un video no cabe ahí todavía: por eso el video va como «Próximamente».';

export const TIPOS_IMAGEN_MATERIAL = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/avif', 'image/heic', 'image/heif',
] as const;

export type Material = {
  id: string;
  nombre: string;
  mimeType: string;
  /** Bytes. 0 significa «no se sabe». */
  tamano: number;
  /** Cliente al que pertenece el archivo, si se puede saber. */
  cliente: string | null;
  origen: OrigenMaterial;
  /** Id del archivo en Drive, si vino de Drive. */
  driveId: string | null;
  /** Carpeta de Drive de la que salió. */
  carpetaId: string | null;
  esImagen: boolean;
  esVideo: boolean;
  /** Quién lo subió o lo registró. */
  persona: string | null;
  fecha: string | null;
  /** Ya se entregó la versión final. */
  entregado: boolean;
};

/**
 * ¿De qué cliente es este archivo?
 *
 * La convención de nombres del equipo es `cliente_pieza_fecha` (por ejemplo
 * `wundeer_reel-lanzamiento_2026-11-09.jpg`). El prefijo es el cliente, y por
 * eso se puede avisar de que un archivo es de otro cliente sin preguntar a
 * nadie: se lee del nombre.
 *
 * Si el prefijo no es un cliente conocido, se devuelve `null` y NO se inventa
 * uno. Un archivo sin cliente no es de todos: es de nadie, y se dice así.
 */
export function clienteDeNombre(nombre: string | null | undefined, clientes: readonly string[]): string | null {
  const limpio = (nombre ?? '').trim().toLowerCase();
  if (!limpio) return null;
  const prefijo = limpio.split(/[_\s.\-]+/)[0] ?? '';
  if (!prefijo) return null;
  const conocido = clientes.find((c) => c.trim().toLowerCase() === prefijo);
  return conocido ?? null;
}

/** ¿El material es de un cliente distinto al que se está mirando? */
export function esDeOtroCliente(material: Pick<Material, 'cliente'>, clienteActual: string): boolean {
  if (!material.cliente) return false;
  return material.cliente.trim().toLowerCase() !== clienteActual.trim().toLowerCase();
}

/** El nombre que se le da a un archivo del hub. */
export function nombreDeMaterial(cliente: string, pieza: string, fecha: string): string {
  const c = saneaParte(cliente) || 'material';
  const p = saneaParte(pieza) || 'pieza';
  const f = saneaParte(fecha) || 'sin-fecha';
  return `${c}_${p}_${f}.jpg`;
}

function saneaParte(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Dónde vive la versión entregada dentro del bucket.
 *
 * El primer segmento es el cliente, como en el resto del hub: es lo que hace
 * que la ruta se pueda comprobar sin mirar la base.
 */
export function rutaDeEntrega(cliente: string, materialId: string, nombre: string): string {
  const c = saneaParte(cliente) || 'material';
  const id = materialId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || 'sin-id';
  const n = nombre
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 120) || 'archivo.jpg';
  return `${c}/entregas/${id}/${n}`;
}

/** Un id de material que no adivine nada del servidor. */
export function idDeMaterial(): string {
  const aleatorio = Math.random().toString(36).slice(2, 10);
  return `mat-${Date.now().toString(36)}-${aleatorio}`;
}

/** Tamaño legible para la interfaz. */
export function tamanoLegible(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Sin tamaño';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** ¿Cabe en el bucket? */
export function cabeEnElBucket(bytes: number): boolean {
  return bytes > 0 && bytes <= TAMANO_MAX_ENTREGA;
}

/** Una fila del registro de auditoría, ya traducida. */
export type EventoMaterialFila = {
  id: string;
  at: string;
  evento: EventoMaterial;
  materialId: string;
  nombre: string;
  cliente: string | null;
  /** Quién lo hizo, dentro del hub. */
  persona: string;
  /** Con qué cuenta de Google, si la acción tocó Drive. */
  cuentaGoogle: string | null;
  detalle: string | null;
};

/** Convierte lo que viene de la base en una fila de auditoría legible. */
export function filaDeEvento(bruto: unknown): EventoMaterialFila | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const fila = bruto as Record<string, unknown>;
  const datos = (fila.despues && typeof fila.despues === 'object' ? fila.despues : {}) as Record<string, unknown>;
  const evento = datos.evento;
  if (evento !== 'subida' && evento !== 'registro' && evento !== 'entrega') return null;
  return {
    id: String(fila.id ?? ''),
    at: typeof fila.at === 'string' ? fila.at : '',
    evento,
    materialId: typeof datos.materialId === 'string' ? datos.materialId : String(fila.row_id ?? ''),
    nombre: typeof datos.nombre === 'string' ? datos.nombre : 'archivo',
    cliente: typeof datos.cliente === 'string' ? datos.cliente : null,
    persona: typeof datos.persona === 'string' ? datos.persona : 'Sin nombre',
    cuentaGoogle: typeof datos.cuentaGoogle === 'string' ? datos.cuentaGoogle : null,
    detalle: typeof datos.detalle === 'string' ? datos.detalle : null,
  };
}
