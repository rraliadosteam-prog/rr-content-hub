/**
 * GET /api/workspace/equipo?proyecto=wundeer — quién puede votar en este cliente.
 *
 * MEDIDO 2026-10-03. El selector de perfil solo vivía en la ficha de una pieza y en
 * la pantalla de votación, y en la barra había un ENLACE que llevava a la pantalla
 * de votación. MEDIDO en producción: en el tablero no había forma de cambiar de
 * perfil sin salirse de donde estás. «No deja cambiar el perfil» era eso: desde el
 * tablero no había con qué.
 *
 * Se lee aquí, y no se pasa por props, por una razón práctica: `WorkspaceShell` lo
 * usan ocho pantallas y cada una tendría que pedir el equipo. Un fetch en el propio
 * selector lo resuelve una vez, y la barra y la ficha muestran la misma lista sin
 * que una dependa de la otra.
 *
 * Es una lectura del equipo que ya puede votar —nombres y correos de gente que está
 * en `rr_hub_profiles` con `is_team_member` e `is_active`— que la pantalla de
 * votación ya muestra. No añade acceso a nada que no estuviera a la vista.
 */
import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/service';
import { quienEs } from '@/lib/quien-es';
import { DEMO_MODE } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  if (DEMO_MODE) {
    // MEDIDO 2026-11-09: en modo ejemplo la lista salía vacía y el selector
    // de perfil de la barra decía «SIN EQUIPO DE VOTACIÓN CONFIGURADO»: un
    // botón que no podía hacer nada. Con la lista de ejemplo, el selector
    // funciona y el hilo de comentarios se puede usar.
    const { demoEquipo } = await import('@/lib/demo-data');
    return NextResponse.json(
      { equipo: demoEquipo, clientes: [], demo: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // REGLA: el equipo se lee solo con sesión. Sin sesión no hay contra quién
  // comprobar acceso, y devolver correos a cualquiera es filtración de datos.
  const sesion = await quienEs();
  if (!sesion) {
    return NextResponse.json({ error: 'No has entrado.' }, { status: 401 });
  }

  const proyecto = new URL(request.url).searchParams.get('proyecto');
  if (!proyecto) {
    return NextResponse.json({ error: 'Falta el proyecto.' }, { status: 400 });
  }

  const supabase = await createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'El servidor no tiene Supabase.' }, { status: 500 });
  }

  const { data: fila, error: proyectoError } = await supabase
    .from('rr_hub_projects')
    .select('id')
    .eq('slug', proyecto)
    .maybeSingle();
  if (proyectoError) {
    return NextResponse.json({ error: proyectoError.message }, { status: 500 });
  }
  if (!fila) {
    return NextResponse.json({ error: 'Ese cliente no existe.' }, { status: 404 });
  }

  // MEDIDO 2026-10-04: el filtro era `is_team_member = true` y por eso salían
  // 18 nombres, uno de ellos la cuenta de servicio `rraliadosteam@gmail.com`
  // («RR Aliados»). Nadie vota con esa cuenta: no es una persona. Se marcó
  // `is_team_member = false` en la base y el filtro la deja fuera sola, sin
  // tener que escribir su correo en el código.
  //
  // Ahora entra también QUIEN ES CLIENTE, que son perfiles reales con
  // `is_team_member = false` pero que tienen `client_viewer` en
  // `rr_hub_access` para este cliente. La pregunta que hace este endpoint es
  // «¿quién puede votar aquí?», no «¿quién es del equipo?». Un cliente que
  // puede ver el tablero puede opinar sobre lo que se le muestra.
  //
  // Lo que NO entra: los perfiles que no tienen fila en `rr_hub_access` para este
  // proyecto. Un nombre sin acceso es un botón que al tocarlo da error.
  const { data: conAcceso } = await supabase
    .from('rr_hub_access')
    .select('user_id')
    .eq('project_id', fila.id);
  const conAccesoIds = new Set((conAcceso ?? []).map((a) => a.user_id as string));

  const { data, error } = await supabase
    .from('rr_hub_profiles')
    .select('id, email, full_name, is_team_member')
    .eq('is_active', true)
    .order('full_name');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // El equipo primero y los clientes despues, para que el equipo —que es quien
  // mas usa esto— quede arriba y el cliente reconoce el suyo sin buscarlo.
  const equipo = (data ?? [])
    .filter((p: { is_team_member: boolean }) => p.is_team_member === true)
    .map((p: { email?: string; full_name?: string }) => ({
      email: String(p.email ?? '').trim(),
      nombre: String(p.full_name ?? '').trim() || String(p.email ?? '').trim(),
    }))
    // Un perfil sin correo no se puede comprobar contra la base al votar: si se
    // ofreciera, el servidor lo rechazaria y el elector no entenderia por que.
    .filter((p: { email: string }) => p.email.length > 0);

  const clientes = (data ?? [])
    .filter((p: { id: string; is_team_member: boolean }) => p.is_team_member !== true)
    .filter((p: { id: string }) => conAccesoIds.has(p.id))
    .map((p: { email?: string; full_name?: string }) => ({
      email: String(p.email ?? '').trim(),
      nombre: String(p.full_name ?? '').trim() || String(p.email ?? '').trim(),
    }))
    .filter((p: { email: string }) => p.email.length > 0);

  return NextResponse.json(
    { equipo, clientes },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  );
}