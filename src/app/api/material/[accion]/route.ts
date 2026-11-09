import { NextResponse, type NextRequest } from 'next/server';
import { quienEs } from '@/lib/quien-es';
import { DEMO_MODE } from '@/lib/demo-mode';
import { createServiceClient } from '@/lib/supabase/service';
import { firmaDeImagen, TIPOS_DE_IMAGEN } from '@/lib/firma-imagen';
import {
  leerEventosMaterial,
  payloadDeEvento,
  registrarEventoDemo,
  entregarVersionFinal,
  type EntradaEvento,
} from '@/lib/material-server';
import { TAMANO_MAX_ENTREGA, type EventoMaterial } from '@/lib/material';
import { cuentaGoogleDe, URL_INFO_USUARIO } from '@/lib/drive';

export const dynamic = 'force-dynamic';

/**
 * Material del hub: registrar, entregar y auditar.
 *
 * LAS TRES COSAS QUE REGISTRA
 *
 *   - `subida`: alguien sube un archivo a la carpeta de Drive.
 *   - `registro`: alguien deja el archivo dentro del hub, ya en una carpeta y
 *     con su cliente identificado.
 *   - `entrega`: se copia la VERSIÓN FINAL al almacenamiento privado y se
 *     devuelve un enlace firmado que vence.
 *
 * QUIÉN ES
 *
 * La identidad sale de dos sitios y se guardan los dos, porque son distintos:
 *
 *   - La persona en el hub (la cookie firmada): es la que trabaja aquí.
 *   - La cuenta de Google (el token): es la que tiene los archivos.
 *
 * La cuenta de Google la resuelve el SERVIDOR, no el navegador: si el
 * navegador dijera «soy esta persona», el registro guardaría lo que quiera el
 * navegador. Con el token en la cabecera, quien dice quién es es Google.
 */

const TIPOS = new Set<string>(TIPOS_DE_IMAGEN);

function tokenDe(request: NextRequest): string | null {
  const cabecera = request.headers.get('authorization') ?? '';
  if (!cabecera.toLowerCase().startsWith('bearer ')) return null;
  const token = cabecera.slice(7).trim();
  return token.length > 20 ? token : null;
}

async function cuentaGoogleDeToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const respuesta = await fetch(`${URL_INFO_USUARIO}?alt=json`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!respuesta.ok) return null;
    const datos = (await respuesta.json()) as unknown;
    return cuentaGoogleDe(datos)?.correo ?? null;
  } catch {
    return null;
  }
}

function error(mensaje: string, estado = 400) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/**
 * Escribe un evento en el registro de auditoría.
 *
 * La escritura vive AQUÍ, en la ruta, y no en `src/lib`: la regla del repo es
 * que ninguna tabla `rr_hub_*` se escribe desde un módulo de `lib`, porque ese
 * módulo puede acabar en el bundle del navegador.
 */
async function registrarEvento(entrada: EntradaEvento): Promise<boolean> {
  if (DEMO_MODE) {
    registrarEventoDemo(entrada);
    return true;
  }
  const service = await createServiceClient();
  if (!service) return false;
  const { error: fallo } = await service.from('rr_hub_audit_log').insert(payloadDeEvento(entrada) as never);
  return !fallo;
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

  const sesion = await quienEs();
  // Sin cookie no hay persona: se dice «Sin nombre». En demostración, el
  // mismo nombre que usa el resto del hub (`/api/quien-soy`).
  const persona = sesion?.nombre?.trim() || (DEMO_MODE ? 'Visitante demo' : 'Sin nombre');
  const correo = sesion?.email?.trim() || '';
  const cuentaGoogle = await cuentaGoogleDeToken(token);

  if (accion === 'registrar') {
    const evento = cuerpo.evento === 'subida' ? 'subida' : 'registro';
    const material = (cuerpo.material ?? {}) as Record<string, unknown>;
    const materialId = typeof material.id === 'string' && material.id ? material.id : '';
    const nombre = typeof material.nombre === 'string' && material.nombre.trim() ? material.nombre.trim() : 'archivo';
    const cliente = typeof material.cliente === 'string' && material.cliente.trim() ? material.cliente.trim() : null;
    if (!materialId) return error('El material no tiene identificación.');

    const resultado = await registrarEvento({
      evento: evento as EventoMaterial,
      materialId,
      nombre,
      cliente,
      persona: correo ? `${persona} (${correo})` : persona,
      cuentaGoogle,
      detalle: typeof material.detalle === 'string' ? material.detalle : null,
    });
    if (!resultado) {
      return error('No se pudo registrar la acción en la auditoría. Avisa a Dirección.', 500);
    }
    return NextResponse.json({ ok: true, id: materialId });
  }

  if (accion === 'entregar') {
    const material = (cuerpo.material ?? {}) as Record<string, unknown>;
    const materialId = typeof material.id === 'string' && material.id ? material.id : '';
    const cliente = typeof material.cliente === 'string' && material.cliente.trim() ? material.cliente.trim() : '';
    const nombre = typeof material.nombre === 'string' && material.nombre.trim() ? material.nombre.trim() : 'archivo.jpg';
    const mimeType = typeof material.mimeType === 'string' ? material.mimeType : 'image/png';
    const base64 = typeof cuerpo.bytes === 'string' ? cuerpo.bytes : '';
    if (!materialId) return error('El material no tiene identificación.');
    if (!cliente) return error('El material no tiene cliente: no se sabe a quién se entrega.');

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
    } catch {
      return error('La versión final llegó corrupta.');
    }
    if (!bytes.length) return error('La versión final llegó vacía.');
    if (bytes.length > TAMANO_MAX_ENTREGA) {
      return error('La versión final supera los 50 MB del almacenamiento de entrega.', 413);
    }
    if (!TIPOS.has(mimeType.toLowerCase())) {
      return error('El almacenamiento de entrega solo admite imágenes. El video va como «Próximamente».', 415);
    }
    if (!firmaDeImagen(bytes, mimeType.toLowerCase())) {
      return error('Eso no es una imagen, aunque se le diga que lo es.', 400);
    }

    const resultado = await entregarVersionFinal({ cliente, materialId, nombre, mimeType, bytes });
    if (!resultado.ok) {
      return error(resultado.error ?? 'No se pudo entregar la versión final.', 500);
    }

    await registrarEvento({
      evento: 'entrega',
      materialId,
      nombre,
      cliente,
      persona: correo ? `${persona} (${correo})` : persona,
      cuentaGoogle,
      detalle: `Enlace firmado por ${resultado.minutos} minutos`,
    });

    return NextResponse.json({
      ok: true,
      ruta: resultado.ruta,
      enlace: resultado.enlace,
      vence: resultado.vence,
      minutos: resultado.minutos,
      demo: resultado.demo ?? false,
    });
  }

  return error('Acción de material desconocida.', 404);
}

/** El registro de auditoría: quién subió, quién registró y quién entregó. */
export async function GET(request: NextRequest) {
  const cliente = request.nextUrl.searchParams.get('cliente');
  const eventos = await leerEventosMaterial(cliente);
  return NextResponse.json({ eventos }, { headers: { 'Cache-Control': 'no-store' } });
}
