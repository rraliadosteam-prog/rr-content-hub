import { NextResponse } from 'next/server';
import { crearSesion, NOMBRE_COOKIE } from '@/lib/hub-session';
import { createServiceClient } from '@/lib/supabase/service';
import { RESPUESTA_LIMITE } from '@/lib/rate-limit';
import { DEMO_MODE } from '@/lib/demo-mode';
import { checkDbLimit, recordDbFailure, recordDbSuccess, retryAfterDb } from '../_lib/rate-limit-db';

/**
 * La puerta. Dos preguntas, una sola ruta.
 *
 * 1. `POST {codigo}` sin persona → ¿qué cliente abre este código y quién tiene
 *    acceso a él? No entra nadie: solo se mira.
 * 2. `POST {codigo, correo, nombre}` → la persona entra. El servidor comprueba
 *    el código Y que esa persona tenga fila de acceso en ESE cliente, y pone una
 *    cookie firmada.
 * 3. `DELETE` → salir.
 *
 * Por qué una sola ruta y no tres: el código se comprueba en un solo sitio. Con
 * una ruta para "buscar" y otra para "entrar", el día que cambie la regla del
 * código hay que acordarse de cambiarla en las dos, y basta con olvidar una para
 * que la puerta tenga un camino de más.
 *
 * Lo que NO se dice nunca: si el código existe. Un "ese código no abre ningún
 * cliente" y un "el cliente existe pero no tiene a nadie" son el mismo 401, y el
 * cliente tampoco se devuelve cuando el código falla. Cuatro dígitos son diez
 * mil: si se puede preguntar en bucle cuál existe, la puerta no existe.
 *
 * Por qué el nombre se manda en el cuerpo y no se deduce: la lista de quien tiene
 * acceso a un cliente ya se le enseñó a esa persona en el paso anterior, y es un
 * dato que ya tiene. Lo que NO se acepta es un nombre TECLEADO: eso sería
 * inventarse a alguien. La lista sale de la base y el servidor comprueba que la
 * persona elegida esté en ella.
 */

function origenDe(peticion: Request): string {
  const cadena = peticion.headers.get('x-forwarded-for') ?? '';
  const primera = cadena.split(',')[0]?.trim();
  return primera || 'desconocido';
}

function sinCookie() {
  const respuesta = NextResponse.json({ error: 'Ese código no abre ningún cliente.' }, { status: 401 });
  return respuesta;
}

export async function POST(request: Request) {
  const origen = origenDe(request);
  const path = '/api/entrar';

  const ok = await checkDbLimit(origen, path);
  if (!ok) {
    const espera = await retryAfterDb(origen, path);
    const respuesta = NextResponse.json(RESPUESTA_LIMITE.cuerpo, { status: RESPUESTA_LIMITE.status });
    respuesta.headers.set('Retry-After', String(espera));
    console.warn(`[entrar] ${origen} bloqueado por rate limit`);
    return respuesta;
  }

  let cuerpo: { codigo?: string; correo?: string; nombre?: string };
  try {
    cuerpo = await request.json();
  } catch {
    return sinCookie();
  }

  const codigo = String(cuerpo.codigo ?? '').replace(/\D/g, '').slice(0, 4);
  if (codigo.length !== 4) {
    await recordDbFailure(origen, path);
    return sinCookie();
  }

  /**
   * MEDIDO 2026-11-09. El modo ejemplo (sin Supabase) no tenía puerta: la
   * pantalla `/login` no existía y las escrituras no tenían a dónde ir.
   *
   * Aquí la puerta del ejemplo es la de verdad —código de cuatro dígitos, cookie
   * firmada, la misma que en producción— con los clientes y las personas del
   * ejemplo. Lo que NO se hace es tocar la base real: en modo ejemplo no hay
   * ninguna, y `crearSesion` firma con `HUB_SECRET` como siempre.
   */
  if (DEMO_MODE) {
    const { demoProjects, demoEquipo } = await import('@/lib/demo-data');
    const cliente = demoProjects.find((p) => p.access_code === codigo);
    if (!cliente) {
      await recordDbFailure(origen, path);
      return sinCookie();
    }
    const correo = String(cuerpo.correo ?? '').trim().toLowerCase();
    if (!correo) {
      return NextResponse.json({
        cliente: { slug: cliente.slug, nombre: cliente.name },
        personas: demoEquipo.map((p) => ({ nombre: p.nombre, correo: p.email })),
        demo: true,
      });
    }
    const persona = demoEquipo.find((p) => p.email === correo);
    if (!persona) {
      await recordDbFailure(origen, path);
      return NextResponse.json(
        { error: 'Ese código no abre ningún cliente, o no tienes acceso a él.' },
        { status: 401 },
      );
    }
    await recordDbSuccess(origen, path);
    const { valor, maxAge } = crearSesion({ nombre: persona.nombre, email: persona.email, proyecto: cliente.slug });
    const respuesta = NextResponse.json({
      ok: true,
      cliente: { slug: cliente.slug, nombre: cliente.name },
      demo: true,
    });
    respuesta.cookies.set(NOMBRE_COOKIE, valor, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    });
    return respuesta;
  }

  const service = await createServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'El sistema de acceso no está configurado.' }, { status: 500 });
  }

  const { data: slug, error: errorCliente } = await service.rpc('rr_hub_cliente_por_codigo', {
    p_codigo: codigo,
  });
  if (errorCliente) {
    console.error('[entrar] no se pudo leer el cliente:', errorCliente.message);
    return NextResponse.json({ error: 'No pudimos comprobar el código.' }, { status: 500 });
  }
  if (!slug) {
    await recordDbFailure(origen, path);
    return sinCookie();
  }

  const { data: proyecto, error: errorProyecto } = await service
    .from('rr_hub_projects')
    .select('slug, name')
    .eq('slug', slug)
    .maybeSingle();
  if (errorProyecto || !proyecto) {
    console.error('[entrar] el cliente del codigo no existe:', errorProyecto?.message);
    await recordDbFailure(origen, path);
    return sinCookie();
  }

  const correo = String(cuerpo.correo ?? '').trim().toLowerCase();
  if (!correo) {
    const { data: personas, error: errorPersonas } = await service.rpc('rr_hub_equipo_del_cliente', {
      p_codigo: codigo,
    });
    if (errorPersonas) {
      console.error('[entrar] no se pudo leer el equipo:', errorPersonas.message);
      return NextResponse.json({ error: 'No pudimos comprobar el código.' }, { status: 500 });
    }
    return NextResponse.json({
      cliente: { slug: proyecto.slug, nombre: proyecto.name },
      personas: (personas ?? []).map((p: { nombre: string; correo: string }) => ({
        nombre: p.nombre,
        correo: p.correo,
      })),
    });
  }

  const { data: puede, error: errorPuerta } = await service.rpc('rr_hub_puede_entrar', {
    p_codigo: codigo,
    p_email: correo,
  });
  if (errorPuerta) {
    console.error('[entrar] fallo la comprobacion de la puerta:', errorPuerta.message);
    return NextResponse.json({ error: 'No pudimos comprobar el código.' }, { status: 500 });
  }
  if (!puede) {
    await recordDbFailure(origen, path);
    return NextResponse.json(
      { error: 'Ese código no abre ningún cliente, o no tienes acceso a él.' },
      { status: 401 },
    );
  }

  const { data: real } = await service
    .from('rr_hub_profiles')
    .select('full_name')
    .ilike('email', correo)
    .maybeSingle();
  const nombre = real?.full_name ?? String(cuerpo.nombre ?? '');

  await recordDbSuccess(origen, path);

  const { valor, maxAge } = crearSesion({ nombre, email: correo, proyecto: proyecto.slug });
  const respuesta = NextResponse.json({
    ok: true,
    cliente: { slug: proyecto.slug, nombre: proyecto.name },
  });
  respuesta.cookies.set(NOMBRE_COOKIE, valor, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  return respuesta;
}

/** Salir. Se borra la cookie y ya. */
export async function DELETE() {
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(NOMBRE_COOKIE, '', { path: '/', maxAge: 0 });
  return respuesta;
}
