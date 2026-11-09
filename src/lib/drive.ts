/**
 * Google Drive con Google Picker, para el módulo de material.
 *
 * El alcance es `drive.file` y solo `drive.file`: la persona da permiso sobre
 * los archivos que el hub cree o que ella elija, y nada más. Con `drive` o
 * `drive.readonly` el hub podría leerle TODO el Drive, que es más de lo que
 * hace falta y más de lo que hay que pedirle a nadie.
 *
 * NUNCA se borra un archivo de Drive ni se cambian sus permisos. Este módulo
 * solo sabe leer (listar, buscar, descargar) y escribir (subir). No hay una
 * función de borrado aquí a propósito: la que no existe no se puede invocar
 * por error.
 *
 * Lo que hay en este archivo es lógica pura: armar la consulta de Drive,
 * validar identificadores y traducir la respuesta de la API. Lo que necesita
 * el DOM (cargar el script del Picker, pedir el token) vive en
 * `src/lib/drive-picker.ts`, que solo se importa desde componentes de cliente.
 */

export const SCOPE_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
export const URL_API_DRIVE = 'https://www.googleapis.com/drive/v3';
export const URL_SUBIDA_DRIVE = 'https://www.googleapis.com/upload/drive/v3/files';
export const URL_INFO_USUARIO = 'https://www.googleapis.com/oauth2/v3/userinfo';
export const URL_SCRIPT_PICKER = 'https://apis.google.com/js/api.js';
export const URL_SCRIPT_GSI = 'https://accounts.google.com/gsi/client';

/** Campos que se piden a Drive. Pedir de menos es más rápido y expone menos. */
export const CAMPOS_ARCHIVO = 'id,name,mimeType,size,parents,thumbnailLink,webViewLink,modifiedTime,createdTime';

export type EstadoCredenciales = 'listo' | 'pendiente';

/**
 * ¿Están las dos piezas públicas de Google?
 *
 * La llave de API y el identificador del cliente OAuth son públicos por
 * diseño (van en el bundle del navegador); lo que NO es público es el secreto
 * del cliente, y ese no se pide ni se usa: el token lo da Google al navegador
 * con el flujo implícito.
 */
export function credencialesDriveListas(env: {
  NEXT_PUBLIC_GOOGLE_API_KEY?: string | undefined;
  NEXT_PUBLIC_GOOGLE_CLIENT_ID?: string | undefined;
}): EstadoCredenciales {
  const llave = env.NEXT_PUBLIC_GOOGLE_API_KEY?.trim() ?? '';
  const cliente = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? '';
  return llave && cliente ? 'listo' : 'pendiente';
}

/** Aviso que se muestra cuando falta lo de Google. Sin nombres de variable en el botón. */
export const MENSAJE_CREDENCIALES_PENDIENTES =
  'Pendiente de configurar: falta la llave pública de Google y el identificador del cliente OAuth. Mientras tanto el módulo trabaja con material de ejemplo.';

/**
 * Identificador de Drive.
 *
 * Los ids de Drive son cadenas cortas con letras, números, guion y guion
 * bajo. Se validan porque van a parar a una URL de la API y a una carpeta: un
 * id con comillas rompería la consulta de Drive o apuntaría a otra cosa.
 */
export function idDriveValido(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(id.trim());
}

/**
 * Texto que se mete dentro de la consulta `q` de Drive.
 *
 * Drive escapa con barra invertida, así que un `'` sin escapar rompe la
 * consulta y el archivo que se busca no aparece. Además se recorta: la
 * consulta viaja en la URL y una búsqueda de 5 000 caracteres no es una
 * búsqueda.
 */
export function textoBusquedaSeguro(texto: string | null | undefined): string {
  return (texto ?? '')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .slice(0, 80);
}

/**
 * La consulta que se manda a `files.list`.
 *
 * - Se excluyen las carpetas: la persona busca MATERIAL, no carpetas.
 * - Si hay carpeta elegida, se listan los archivos DE ESA carpeta.
 * - El nombre se busca con `contains`, sin distinguir mayúsculas.
 */
export function consultaDeArchivos({ carpetaId, busqueda }: { carpetaId?: string | null; busqueda?: string | null }): string {
  const partes: string[] = ["mimeType != 'application/vnd.google-apps.folder'"];
  if (idDriveValido(carpetaId)) partes.push(`'${carpetaId.trim()}' in parents`);
  const texto = textoBusquedaSeguro(busqueda);
  if (texto) partes.push(`name contains '${texto}'`);
  return partes.join(' and ');
}

export type ArchivoDrive = {
  id: string;
  nombre: string;
  mimeType: string;
  /** Bytes. Drive no siempre lo manda; 0 significa «no lo sé». */
  tamano: number;
  esImagen: boolean;
  esVideo: boolean;
  carpetaId: string | null;
  modificado: string | null;
  miniatura: string | null;
};

const TIPOS_IMAGEN = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/avif', 'image/heic', 'image/heif',
]);

export function esImagen(mimeType: string | null | undefined): boolean {
  return TIPOS_IMAGEN.has((mimeType ?? '').trim().toLowerCase());
}

export function esVideo(mimeType: string | null | undefined): boolean {
  return (mimeType ?? '').trim().toLowerCase().startsWith('video/');
}

/**
 * Traduce un archivo de la API de Drive.
 *
 * Lo que no se puede traducir se devuelve `null`: un id que no es un id no
 * puede pasar por un id, y una respuesta de Drive con un campo raro tiene que
 * ser un archivo que no se muestra, no un archivo con datos inventados.
 */
export function archivoDeDrive(bruto: unknown): ArchivoDrive | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const fila = bruto as Record<string, unknown>;
  const id = typeof fila.id === 'string' ? fila.id.trim() : '';
  if (!idDriveValido(id)) return null;
  const mimeType = typeof fila.mimeType === 'string' ? fila.mimeType : '';
  const nombre = typeof fila.name === 'string' && fila.name.trim() ? fila.name.trim() : 'archivo';
  const tamano = typeof fila.size === 'string' ? Number.parseInt(fila.size, 10) : 0;
  const padres = Array.isArray(fila.parents) ? fila.parents.filter((p): p is string => typeof p === 'string') : [];
  return {
    id,
    nombre,
    mimeType,
    tamano: Number.isFinite(tamano) && tamano > 0 ? tamano : 0,
    esImagen: esImagen(mimeType),
    esVideo: esVideo(mimeType),
    carpetaId: padres[0] ?? null,
    modificado: typeof fila.modifiedTime === 'string' ? fila.modifiedTime : null,
    miniatura: typeof fila.thumbnailLink === 'string' ? fila.thumbnailLink : null,
  };
}

/** Traduce una lista de la API de Drive, dejando fuera lo que no se puede leer. */
export function archivosDeDrive(bruto: unknown): ArchivoDrive[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.map(archivoDeDrive).filter((a): a is ArchivoDrive => a !== null);
}

/**
 * La cuenta de Google con la que se está trabajando.
 * Sale del token: el hub no la pide, la lee de Google.
 */
export type CuentaGoogle = { correo: string; nombre: string | null };

export function cuentaGoogleDe(bruto: unknown): CuentaGoogle | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const fila = bruto as Record<string, unknown>;
  const correo = typeof fila.email === 'string' ? fila.email.trim() : '';
  if (!correo) return null;
  const nombre = typeof fila.name === 'string' && fila.name.trim() ? fila.name.trim() : null;
  return { correo, nombre };
}
