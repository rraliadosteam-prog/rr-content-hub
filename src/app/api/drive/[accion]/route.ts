import { NextResponse, type NextRequest } from 'next/server';
import {
  CAMPOS_ARCHIVO,
  URL_API_DRIVE,
  URL_INFO_USUARIO,
  URL_SUBIDA_DRIVE,
  archivosDeDrive,
  consultaDeArchivos,
  cuentaGoogleDe,
  idDriveValido,
} from '@/lib/drive';
import { ARCHIVOS_DEMO, CARPETAS_DEMO, CUENTA_GOOGLE_DEMO } from '@/lib/material-demo';

export const dynamic = 'force-dynamic';

/**
 * Proxy de Google Drive para el módulo de material.
 *
 * POR QUÉ HAY UN PROXY Y NO LLAMAR A DRIVE DESDE EL NAVEGADOR
 *
 * El token de la persona no se guarda en el hub, y sin guardarlo no hay forma
 * de que el servidor sepa de quién es. Con el proxy, cada petición lleva el
 * token en la cabecera `Authorization` y el servidor lo usa para esa llamada y
 * se le olvida. El token nunca se escribe en la base, ni en una cookie, ni en
 * un archivo, ni en un log.
 *
 * LO QUE ESTE ARCHIVO NO PUEDE HACER
 *
 *   - No borra. No hay ninguna acción de borrado, y no se puede inventar una:
 *     el alcance `drive.file` no da permiso para borrar lo que la persona no
 *     creó, y aunque lo diera, el hub no lo pide.
 *   - No cambia permisos. No hay acción para compartir ni para mover.
 *   - No pide permisos para el Drive entero: el alcance es `drive.file`.
 *
 * SIN CREDENCIALES
 *
 * Si no hay token, o no hay llave pública de Google, la ruta responde con
 * material de ejemplo y lo dice (`demo: true`). La interfaz muestra que está
 * en modo ejemplo en vez de fingir que son archivos reales.
 */

function tokenDe(request: NextRequest): string | null {
  const cabecera = request.headers.get('authorization') ?? '';
  if (!cabecera.toLowerCase().startsWith('bearer ')) return null;
  const token = cabecera.slice(7).trim();
  return token.length > 20 ? token : null;
}

function error(mensaje: string, estado = 400) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accion: string }> },
) {
  const { accion } = await params;
  const token = tokenDe(request);

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    cuerpo = {};
  }

  switch (accion) {
    case 'listar':
      return listar(cuerpo, token);
    case 'subir':
      return subir(cuerpo, token);
    case 'bajar':
      return bajar(cuerpo, token);
    case 'cuenta':
      return cuenta(token);
    default:
      return error('Acción de Drive desconocida.', 404);
  }
}

/** Lista (y busca) archivos de una carpeta. */
async function listar(cuerpo: Record<string, unknown>, token: string | null) {
  const carpetaId = typeof cuerpo.carpetaId === 'string' ? cuerpo.carpetaId : '';
  const busqueda = typeof cuerpo.busqueda === 'string' ? cuerpo.busqueda : '';

  if (!token) {
    const archivos = ARCHIVOS_DEMO.filter((archivo) => {
      if (carpetaId && archivo.carpetaId !== carpetaId) return false;
      if (busqueda.trim() && !archivo.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
      return true;
    });
    return NextResponse.json({ archivos, demo: true, mensaje: 'Material de ejemplo: falta conectar Google.' });
  }

  const consulta = consultaDeArchivos({ carpetaId, busqueda });
  const url = `${URL_API_DRIVE}/files?q=${encodeURIComponent(consulta)}&fields=${encodeURIComponent(CAMPOS_ARCHIVO)}&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=modifiedTime desc`;
  const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!respuesta.ok) {
    return error('Google Drive no respondió a la búsqueda. Revisa el permiso de la carpeta.', 502);
  }
  const datos = (await respuesta.json()) as { files?: unknown };
  return NextResponse.json({ archivos: archivosDeDrive(datos.files), demo: false });
}

/** Sube un archivo a la carpeta elegida. Nunca borra ni cambia permisos. */
async function subir(cuerpo: Record<string, unknown>, token: string | null) {
  const carpetaId = typeof cuerpo.carpetaId === 'string' ? cuerpo.carpetaId : '';
  const nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim().slice(0, 200) : '';
  const mimeType = typeof cuerpo.mimeType === 'string' ? cuerpo.mimeType : 'application/octet-stream';
  const base64 = typeof cuerpo.bytes === 'string' ? cuerpo.bytes : '';

  if (!nombre) return error('El archivo no tiene nombre.');
  if (!idDriveValido(carpetaId)) return error('La carpeta de destino no es válida.');

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    return error('El archivo llegó corrupto.');
  }
  if (!bytes.length) return error('El archivo llegó vacío.');

  if (!token) {
    return NextResponse.json({
      demo: true,
      mensaje: 'Subida de ejemplo: falta conectar Google.',
      archivo: {
        id: `demo-subida-${Date.now().toString(36)}`,
        nombre,
        mimeType,
        tamano: bytes.length,
        esImagen: mimeType.startsWith('image/'),
        esVideo: mimeType.startsWith('video/'),
        carpetaId,
        modificado: new Date().toISOString(),
        miniatura: null,
      },
    });
  }

  const frontera = `rr-hub-${Math.random().toString(36).slice(2)}`;
  const metadatos = JSON.stringify({ name: nombre, parents: [carpetaId], mimeType });
  const cabeza = Buffer.from(
    `--${frontera}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadatos}\r\n--${frontera}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  const cola = Buffer.from(`\r\n--${frontera}--`, 'utf8');
  const payload = Buffer.concat([cabeza, bytes, cola]);

  const respuesta = await fetch(
    `${URL_SUBIDA_DRIVE}?uploadType=multipart&fields=${encodeURIComponent(CAMPOS_ARCHIVO)}&supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${frontera}`,
      },
      body: payload,
      cache: 'no-store',
    },
  );
  if (!respuesta.ok) {
    return error('Google Drive no aceptó la subida. Revisa el permiso de la carpeta.', 502);
  }
  const datos = (await respuesta.json()) as unknown;
  const archivo = archivosDeDrive([datos])[0];
  return NextResponse.json({ archivo, demo: false });
}

/** Baja el contenido de un archivo para poder editarlo en el hub. */
async function bajar(cuerpo: Record<string, unknown>, token: string | null) {
  const archivoId = typeof cuerpo.archivoId === 'string' ? cuerpo.archivoId : '';
  if (!idDriveValido(archivoId)) return error('El archivo no es válido.');

  if (!token) {
    // En modo ejemplo no hay bytes: el navegador pinta una imagen de muestra
    // con el canvas. Devolver bytes de mentira sería peor que no devolverlos.
    return NextResponse.json({ demo: true, bytes: null, mimeType: 'image/png' });
  }

  const respuesta = await fetch(`${URL_API_DRIVE}/files/${archivoId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!respuesta.ok) {
    return error('Google Drive no entregó el archivo.', 502);
  }
  const buffer = Buffer.from(await respuesta.arrayBuffer());
  const tipo = respuesta.headers.get('content-type') ?? 'application/octet-stream';
  return NextResponse.json({
    demo: false,
    bytes: buffer.toString('base64'),
    mimeType: tipo.split(';')[0] ?? 'application/octet-stream',
  });
}

/** Quién es la persona en Google. Lo resuelve Google, no el hub. */
async function cuenta(token: string | null) {
  if (!token) {
    return NextResponse.json({ demo: true, cuenta: CUENTA_GOOGLE_DEMO });
  }
  const respuesta = await fetch(`${URL_INFO_USUARIO}?alt=json`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!respuesta.ok) return error('No se pudo leer la cuenta de Google.', 502);
  const datos = (await respuesta.json()) as unknown;
  const cuenta = cuentaGoogleDe(datos);
  if (!cuenta) return error('Google no devolvió la cuenta.', 502);
  return NextResponse.json({ demo: false, cuenta });
}

/**
 * Las carpetas de ejemplo, para el selector del módulo cuando no hay
 * credenciales. Con credenciales, el selector real es el Google Picker.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ accion: string }> },
) {
  const { accion } = await params;
  if (accion !== 'carpetas') return error('Acción de Drive desconocida.', 404);
  return NextResponse.json({ carpetas: CARPETAS_DEMO, demo: true });
}
