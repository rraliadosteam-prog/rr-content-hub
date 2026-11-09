import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { allowedTransitions, ganoLaVotacion, perdioLaVotacion, estadoVotacion, VOTOS_NECESARIOS, votosParaDecidir, ROLE_LABEL, salidaDeLaVotacion, caidaDeLaVotacion, hayCambioPedido, frenaLaVotacion, salidaDelCambioPedido, DECISIONES_VOTO, type DecisionVoto, type RoleKey, type WorkflowStatus, PUEDE_EDITAR, PUEDE_ESCRIBIR_GUION, PUEDE_COMENTAR, PUEDE_BORRAR, PUEDE_BORRAR_ESTADOS } from '@/lib/flow';
import { rolEnProyecto } from '@/lib/project-guard';
import { quienEs } from '@/lib/quien-es';
import { DEMO_MODE } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';

/**
 * Workspace mutations, executed server-side.
 *
 * Why this exists: every write used to happen from the browser with the
 * publishable anon key. That made `transitionIdeaStatus`'s role check a
 * suggestion — the comment in that function claimed a hand-crafted request
 * could not skip states, and it absolutely could, because the only thing
 * standing between the request and the table was code running on the machine
 * making it. The fix is not a better client-side check; it is for the check to
 * happen where the client cannot edit it.
 *
 * Authorization here is the session's role in `rr_hub_access`, never a value
 * posted by the caller. RLS stays on as the second layer.
 */
/**
 * Who the caller is, with one documented escape hatch.
 *
 * Why this exists: the hub reads its roles from `rr_hub_access`, and in
 * production that table is EMPTY — as is `rr_hub_profiles`. So the rule was,
 * literally: log in and still get a 401, with no way in but SQL. That is what
 * "no me deja crear ideas" was. `SUPER_ADMIN_EMAILS` already existed for
 * `/audit/admin`; the same list now also unlocks the project role, so a human
 * can keep working while the roster is being filled in.
 *
 * It is deliberately the SAME env var and the SAME semantics as
 * `admin-guard.ts`: an operator-configured list, never in the repo, and never
 * widening what a project role can do — a super admin is `owner`, which is the
 * top of the existing ladder, not a new bypass.
 */
import { esSuperAdmin } from '@/lib/config';

function isSuperAdmin(email: string): boolean {
  return esSuperAdmin(email);
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function unauthorized() {
  // Un solo mensaje para "no entraste" y para "no tienes acceso aquí": responder
  // distinto a cada caso sería una forma de averiguar quién tiene acceso a qué.
  //
  // El texto ya no dice "sesión" porque no hay ninguna. La puerta es un código
  // por cliente, y cuando esto salía significaba una de dos cosas que se veían
  // igual desde fuera: que no habías entrado, o que habías entrado y el rol
  // salía vacío. Un 401 que no dice cuál de las dos es no dice nada.
  // MEDIDO 2026-10-04: con acceso libre este camino no se alcanza. El mensaje
  // se deja coherente con el modelo nuevo en vez de Speaking de una puerta que
  // ya no hay: «Entra con el codigo de tu cliente» era verdad hasta el
  // 2026-10-04 y ya no lo es.
  return error('No se pudo comprobar tu acceso a esa operacion.', 403);
}

/**
 * YA NO HAY MODO ABIERTO.
 *
 * Existió entre 2026-09-26 y 2026-09-28: mientras el login de Google peleaba
 * con Medellín Guide por la sesión de Supabase, una variable de entorno
 * apagaba la puerta y el hub quedaba abierto para cualquiera con la URL.
 *
 * Se quitó porque la puerta ya no es una sesión de Supabase. Ahora es un código
 * de cuatro dígitos por cliente, y la variable `NEXT_PUBLIC_AUTH_ENABLED` que
 * lo apagaba no la controla: en Vercel no está puesta, así que `ABIERTO` salía
 * `true` siempre. El hub se creía abierto por un interruptor que ya no
 * controlaba nada — y `unauthorized()` tiraba un 401 a quien entraba bien, con
 * un mensaje que además hablaba de una "sesión" que no existe.
 *
 * La consecuencia de dejarlo como estaba: la puerta de `/login` abría, el
 * tablero cargaba, y todo lo que se intentaba escribir rebotaba con un 401 que
 * no señalaba su causa. Un 401 sin causa es un apagón, no un permiso.
 *
 * Lo que decide ahora si una petición vale es la cookie firmada
 * (`hub-session.ts`) y el guard (`project-guard.ts`). No hay interruptor que
 * apagar, y esa es la diferencia entre una puerta y una puerta con un botón de
 * "abrir" que nadie vigila.
 */

/** Quien figura en las piezas cuando la subida no trae id resuelto. */
const SIN_QUIEN = 'sin-quien';

async function context(request: NextRequest, accion: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return { response: error('El servidor no tiene la configuración de Supabase.', 500) as NextResponse };
  }

  // El service client es quien escribe. Ya no hay cliente anónimo para quien
  // llama: con la puerta por código el RLS no tiene contra qué comparar, y
  // mandar un `authorization` vacío no abría nada, solo hacía ruido.
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // La puerta es un código por cliente (2026-09-28): la identidad viene de la
  // cookie firmada del hub. Se resuelve el `user_id` DESDE el correo, porque
  // `rr_hub_profiles.id` sigue siendo la PK pero ya no hay sesión de Supabase
  // que lo dé. Buscar por correo es la misma fila y no depende de que exista
  // una cuenta en `auth.users`.
  /**
   * MEDIDO 2026-10-03. `comment` y `vote` devolvían «Entra con el código de tu
   * cliente» a quien no tuviera sesión, y en el hub en puerta por código casi
   * nadie la tiene. MEDIDO en producción: el botón de comentar se activaba, se
   * pulsaba y no se publicaba nada; el de votar, igual.
   *
   * Las dos acciones son del EQUIPO, y el equipo se identifica por el perfil que
   * elige en la pantalla, no por la sesión. Así que sin sesión no se corta aquí:
   * se sigue, y cada una vuelve a comprobar su perfil contra `rr_hub_profiles`.
   *
   * Lo que NO cambia: el resto de acciones siguen exigiendo sesión, y estas dos no
   * abren nada que estuviera cerrado — quien no está en la lista del equipo recibe
   * 403 igual que antes.
   */
  // MEDIDO 2026-10-04. Santiago: «no pidas nada de acceso, que sea 100% libre»
  // y «todos los del equipo entran como owner en todo».
  //
  // Lo que cambia, y es un cambio de MODELO, no un ajuste: `comment` y `vote`
  // ya se permitian sin sesion desde el 2026-10-03. Ahora es TODA accion, y el
  // rol pasa a ser `owner` sin condiciones.
  //
  // Que queda sin proteccion, y hay que decirlo claro: con esto, cualquier
  // persona con la URL puede aprobar, mover, editar y borrar ideas de Wundeer y
  // de Candilejas. No hay lista, no hay codigo y no hay sesion que comprobar. Es
  // exactamente lo que se pidio, y el unico sitio donde sigue habiendo un limite
  // es el catalogo: solo se ven los clientes de `HUB_CATALOGO_VISIBLE`.
  //
  // Lo que NO se pierde: la trazabilidad. `created_by` y `actor_label` siguen
  // saliendo de la fila de perfil comprobada por el servidor, o del perfil
  // elegido en el selector cuando no hay sesion. Entrar libre no significa
  // escribir sin nombre.
  const sesion = await quienEs();
  if (!sesion) {
    return {
      supabase: service, service, userId: null, email: null,
      proyecto: null, abierto: true, cabeceras: request.headers,
    };
  }
  const { data: perfil } = await service
    .from('rr_hub_profiles')
    .select('id')
    .ilike('email', sesion.email)
    .maybeSingle();
  // MEDIDO 2026-10-04: con la sesion valida pero SIN fila en `rr_hub_profiles`
  // (correo tecleado que no existe en la base), el camino es el mismo que sin
  // sesion: se sigue como visitante y el rol sale del perfil que elija en el
  // selector. Antes esto cortaba con 401 para todo menos `comment` y `vote`.
  if (!perfil) {
    return {
      supabase: service, service, userId: null, email: null,
      proyecto: null, abierto: true, cabeceras: request.headers,
    };
  }

  // Lectura y escritura van por el service client, siempre. El RLS ya no decide
  // nada aquí porque ya no hay identidad de Supabase que comparar; lo que
  // autoriza es el guard de cada mutación, que corre con estos mismos datos.
  return {
    supabase: service, service, userId: perfil.id, email: sesion.email, proyecto: sesion.proyecto, abierto: false,
    // Lo que el servidor LEYO de la peticion, no lo que el navegador pidio. La
    // cabecera se lee aqui, una vez, y de aqui sale el `origen`: ningun
    // `body.origen` se consulta en ningun sitio.
    cabeceras: request.headers,
  };
}

/** The caller's real role in the project that owns this idea. Never from the body. */
async function roleForIdea(supabase: SupabaseClient, userId: string, email: string, ideaId: string): Promise<RoleKey | null> {
  const { data } = await supabase
    .from('rr_hub_ideas')
    .select('project:rr_hub_projects!inner(id)')
    .eq('id', ideaId)
    .maybeSingle();
  const project = (data?.project as { id?: string } | undefined)?.id;
  if (!project) return null;

  const { data: access } = await supabase
    .from('rr_hub_access')
    .select('role_in_project')
    .eq('user_id', userId)
    .eq('project_id', project)
    .maybeSingle();
  if (access?.role_in_project) return access.role_in_project as RoleKey;

  // The roster is empty in production; without this nobody could ever move a
  // piece, not even the owner. Same list and same meaning as admin-guard.ts.
  if (isSuperAdmin(email)) return 'owner';
  return null;
}

/** El proyecto al que pertenece una idea. `null` si la idea no existe. */
async function projectIdDeIdea(supabase: SupabaseClient, ideaId: string): Promise<string | null> {
  const { data } = await supabase
    .from('rr_hub_ideas')
    .select('project:rr_hub_projects!inner(id)')
    .eq('id', ideaId)
    .maybeSingle();
  return (data?.project as { id?: string } | undefined)?.id ?? null;
}

/**
 * El rol que corresponde al PERFIL ELEGIDO en el selector, sin sesión.
 *
 * MEDIDO 2026-10-04. Santiago: «asegúrate de que el perfil de los dos de Wundeer
 * [puedan] entrar desde esos perfiles y poder aprobar». El cliente abre el hub en
 * el celular sin iniciar sesión con Google: elige «Cliente Wundeer 1» en el
 * selector. Ese perfil vive en `localStorage`, o sea en el navegador, y el
 * servidor se.renderiza sin él: `rolEnProyecto()` caía a `client_viewer` y la
 * ficha llegaba con «SIN ACCIÓN DISPONIBLE». El rol del cliente era
 * `client_viewer` (solo lectura) además, así que aunque el botón hubiera salido,
 * la transición se rechazaba con 403.
 *
 * Aquí se resuelve contra la fila REAL de `rr_hub_access`, no contra lo que
 * pidió el navegador: se acepta el correo que el cliente eligió como identidad
 * declarada y se devuelve el rol que la base le tiene asignado. Alguien que se
 * haga pasar por un correo ajeno recibe el rol de ese correo, no el suyo, así que
 * escribir «cliente@wundeer.co» desde otro celular concede lo que ese perfil
 * concede y nada más — igual que con la lista blanca de votación. No se inventa
 * ningún permiso: solo se deja de tirar el que sí tiene.
 */
async function roleForPerfilElegido(
  service: SupabaseClient,
  projectId: string,
  identidad: string,
): Promise<RoleKey | null> {
  const correo = identidad.trim().toLowerCase();
  if (!correo) return null;

  const { data: perfil } = await service
    .from('rr_hub_profiles')
    .select('id, is_active')
    .ilike('email', correo)
    .maybeSingle();
  if (!perfil || perfil.is_active === false) return null;

  const { data: acceso } = await service
    .from('rr_hub_access')
    .select('role_in_project')
    .eq('user_id', perfil.id)
    .eq('project_id', projectId)
    .maybeSingle();
  return (acceso?.role_in_project as RoleKey) ?? null;
}

/**
 * El rol de quien llama sobre UNA idea. Única fuente: lo usan el despacho y `borrar`.
 *
 * Orden: (1) la cookie firmada + su fila en `rr_hub_access`; (2) el perfil elegido
 * en el selector (`actorProfile`) contrastado con su fila REAL en `rr_hub_access`.
 * Sin ninguna de las dos: `null`. Ya NO existe el "anónimo es owner".
 */
async function resolverRol(ctx: Ctx, ideaId: string, identidad: string): Promise<RoleKey | null> {
  if (!ctx.abierto) {
    const porSesion = await roleForIdea(ctx.supabase, ctx.userId!, ctx.email!, ideaId);
    if (porSesion) return porSesion;
  }
  if (!identidad) return null;
  const projectId = await projectIdDeIdea(ctx.supabase, ideaId);
  return projectId ? roleForPerfilElegido(ctx.service, projectId, identidad) : null;
}

type Body = Record<string, unknown>;

/** The three things every action needs: the caller's own client, the service client, and who they are. */
type Ctx = {
  supabase: SupabaseClient;
  service: SupabaseClient;
  userId: string | null;
  email: string | null;
  /**
   * Slug del cliente con el que entraste, ej. 'wundeer'. MEDIDO 2026-10-03:
   * faltaba aquí y por eso `asset` no podía comprobar que una idea fuera del
   * cliente de quien llama — el bypass está documentado en la acción.
   */
  proyecto: string | null;
  /** Modo abierto: no hay sesión que comprobar y el rol no se consulta. */
  abierto: boolean;
  /** Las cabeceras REALES de la petición, leídas en el servidor. */
  cabeceras: Headers;
};

/**
 * La cabecera que declara el origen. Vive aquí y no en el cuerpo del POST para
 * que el valor no viaje en el JSON que cualquiera puede replicar desde otro
 * script: leerla obliga a estar en el servidor.
 */
export const CABEZA_ORIGEN = 'x-rr-origen';

const str = (value: unknown, max = 4000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** POST /api/workspace/transition — move an idea between states. */

/**
 * Las escrituras del modo ejemplo.
 *
 * Devuelve `null` cuando la acción no tiene equivalente en el cuaderno local:
 * en ese caso sigue el camino normal, que sin base responde con su motivo.
 */
async function accionEnEjemplo(action: string, body: Body): Promise<NextResponse | null> {
  const { DEMO_MODE } = await import('@/lib/demo-mode');
  if (!DEMO_MODE) return null;

  if (action === 'create-idea') {
    const title = str(body.title, 160);
    if (title.length < 3) return error('El título necesita al menos 3 caracteres.', 400);
    const projectSlug = str(body.projectSlug, 60);
    if (!projectSlug) return error('No se pudo saber el cliente de la idea.', 400);
    const reference = str(body.referenceUrls ? (body.referenceUrls as string[])[0] : '', 300);
    if (!reference || !/^https?:\/\//.test(reference)) {
      return error('Toda idea necesita al menos un link de referencia. Sin referencia no se crea la idea.', 400);
    }
    const { crearIdeaDemo } = await import('@/lib/demo-store');
    const { demoIdeas } = await import('@/lib/demo-data');
    const idea = await crearIdeaDemo({
      codigosReservados: demoIdeas.map((i) => i.code),
      proyecto: projectSlug,
      title,
      description: str(body.description, 2000),
      objective: str(body.objective, 500),
      contentType: body.contentType === 'paid' ? 'paid' : 'organic',
      category: str(body.category, 80),
      reference,
      camera: str(body.cameraBrief, 1000),
      talent: str(body.talentBrief, 1000),
      edit: str(body.editBrief, 1000),
      script: str(body.script, 8000),
    });
    return NextResponse.json({ success: true, id: idea.id, code: idea.code, demo: true });
  }

  if (action === 'comment') {
    const text = str(body.body, 4000);
    if (!text) return error('El comentario está vacío.', 400);
    const ideaId = str(body.ideaId, 64);
    if (!ideaId) return error('Falta ideaId.', 400);
    const identidad = str(body.authorProfile, 200);
    if (!identidad) return error('Elige con qué perfil comentas antes de publicar.', 400);
    const { demoEquipo } = await import('@/lib/demo-data');
    const persona = demoEquipo.find((p) => p.email.toLowerCase() === identidad.trim().toLowerCase());
    if (!persona) return error('Ese correo no está en la lista del equipo.', 403);
    const { crearComentarioDemo } = await import('@/lib/demo-store');
    await crearComentarioDemo({
      ideaId,
      body: text,
      autor: `${persona.nombre} · EQUIPO`,
      rol: 'EQUIPO',
    });
    return NextResponse.json({ success: true, demo: true });
  }

  if (action === 'resolve-comment') {
    const commentId = str(body.commentId, 64);
    if (!commentId) return error('Falta commentId.', 400);
    const { resolverComentarioDemo } = await import('@/lib/demo-store');
    const ok = await resolverComentarioDemo(commentId, body.resolved === true);
    if (!ok) return error('Ese comentario no existe.', 404);
    return NextResponse.json({ success: true, demo: true });
  }

  return null;
}

export async function POST(request: NextRequest) {
  const route = request.nextUrl.pathname;
  const action = route.split('/').pop() ?? '';

  let body: Body;
  try { body = (await request.json()) as Body; } catch { return error('Cuerpo JSON inválido.', 400); }

  /**
   * MEDIDO 2026-11-09. En modo ejemplo (sin Supabase) TODAS las escrituras
   * respondían 500 «El servidor no tiene la configuración de Supabase»: crear
   * una pieza, comentar y resolver un comentario quedaban como botones rotos
   * en el recorrido local.
   *
   * Ahora las tres que el equipo usa todos los días funcionan contra el
   * cuaderno local (`.data/demo/`), y las demás responden con un motivo
   * CLARO: no un 500 que no dice nada. La base real no se toca: en modo
   * ejemplo no hay ninguna.
   */
  if (DEMO_MODE) {
    const respuesta = await accionEnEjemplo(action, body);
    if (respuesta) return respuesta;
  }

  const ctx = await context(request, action);
  if ('response' in ctx) return ctx.response;
  const { service, supabase, userId, email } = ctx;

  // Creating an idea is the one action that has no idea to authorise against,
  // so it is handled before the ideaId requirement. The roster joins it: it also
  // has no idea, and asking for one would 400 before ever getting to the lookup.
  if (action === 'create-idea') return createIdea(body, ctx);
  if (action === 'roster') return roster(body, ctx);
  // El rol real del perfil elegido, para que la ficha muestre sus botones. Va
  // aparte de la página porque el perfil vive en `localStorage`: el servidor
  // renderiza sin él y no puede saber, al pintar, quién va a mirar.
  if (action === 'mi-rol') return miRol(body, ctx);

  const ideaId = str(body.ideaId, 64);
  if (!ideaId) return error('Falta ideaId.', 400);

  // En modo abierto no hay a quién preguntar: se opera con el rol de
  // administración, que es el más alto de la escalera que ya existe. No se
  // inventa un rol nuevo, y en cuanto la puerta vuelva a encendirse este
  // camino deja de alcanzarse.
  //
  // MEDIDO 2026-10-03 — CORRECCIÓN IMPORTANTE. Este `owner` era inocuo mientras
  // `ctx.abierto` era siempre `false`: el interruptor que lo activaba ya no
  // controlaba nada. Al abrir `comment` y `vote` sin sesión, `abierto` pasó a ser
  // `true` de verdad, y este `owner` habría dado TODO el poder de escritura a
  // cualquiera que abriera la URL: `transition`, `borrar`, `script`, `update`.
  //
  // MEDIDO 2026-10-04, el modelo cambió. Antes `owner` en abierto valía SOLO para
  // `comment` y `vote`, y para el resto caía al camino normal: sin sesión, 401.
  // Ese recorte lo protects a propósito cuando se abrieron esas dos (2026-10-03),
  // porque dar `owner` a cualquiera que abriera la URL significaba que un
  // desconocido podía aprobar y borrar piezas de Wundeer.
  //
  // Santiago pidió lo contrario y lo dijo dos veces: «100% libre» y «todos los
  // del equipo entran como owner en todo». Así que `abierto` da `owner` para
  // TODA acción. Lo que protege ya no es el rol sino el catálogo: solo son
  // visibles los clientes de `HUB_CATALOGO_VISIBLE`.
  // MEDIDO 2026-10-04: el cliente de Wundeer entra desde el selector del celular
  // y no tenía forma de aprobar — la ficha salía con «SIN ACCIÓN DISPONIBLE»
  // porque sin sesión el rol cae a `client_viewer`. Antes de ceder `owner` a
  // cualquiera (que es lo que hace `abierto`), se pregunta a la base qué rol
  // tiene el perfil que el cliente declaró. Si hay fila, ese rol manda: un
  // `client_approver` aprueba y un `client_viewer` solo mira, y el equipo sin
  // sesión sigue entrando por el modelo abierto de siempre.
  const role = await resolverRol(ctx, ideaId, str(body.actorProfile, 200));
  if (!role) return unauthorized();

  if (action === 'transition') {
    const to = str(body.toStatus, 40) as WorkflowStatus;
    const from = str(body.fromStatus, 40) as WorkflowStatus;
    if (!to || !from) return error('Faltan fromStatus o toStatus.', 400);

    // The one authority on legal moves, now on the server.
    const permitted = allowedTransitions(role, from).some((move) => move.to === to);
    if (!permitted) return error(`El rol ${ROLE_LABEL[role]} no puede pasar de ${from} a ${to}.`, 403);

    const { data: current, error: readError } = await supabase
      .from('rr_hub_ideas').select('status').eq('id', ideaId).maybeSingle();
    if (readError) return error(readError.message, 500);
    if (!current) return error('La idea no existe.', 404);
    // The browser's idea of `from` is not trusted: read the real one.
    if (current.status !== from) return error(`La idea ya no está en ${from} (está en ${current.status}). Recarga.`, 409);

    const { error: updateError } = await service
      .from('rr_hub_ideas').update({ status: to, updated_at: new Date().toISOString() }).eq('id', ideaId);
    if (updateError) return error(updateError.message, 500);

    const { error: eventError } = await service.from('rr_hub_events').insert({
      idea_id: ideaId, from_status: from, to_status: to,
      comment: str(body.note, 1000) || null, actor_label: ROLE_LABEL[role],
    });
    if (eventError) return error(eventError.message, 500);
    return NextResponse.json({ success: true });
  }

  if (action === 'script') {
    if (!PUEDE_ESCRIBIR_GUION.includes(role)) {
      return error('Tu rol no escribe el guion. Pídeselo a quien/edite la pieza.', 403);
    }
    const script = str(body.script, 60_000);
    if (!script) return error('El guion está vacío.', 400);
    const { error: updateError } = await service
      .from('rr_hub_ideas').update({ script_content: script, updated_at: new Date().toISOString() }).eq('id', ideaId);
    if (updateError) return error(updateError.message, 500);
    // Deliberately no event: saving a script is not a state transition, and a
    // fake one in the timeline is worse than no trace.
    return NextResponse.json({ success: true });
  }

  if (action === 'roster') return roster(body, ctx);

  /**
   * Editar los datos de la pieza.
   *
   * Existía un hueco real: se podía crear una idea, moverla de fase, escribir el
   * guion, comentar y asignar responsable, pero NO corregir un campo. Una pieza
   * creada sin referencia se quedaba así para siempre — 6 de 26 en Wundeer, y
   * dos de ellas ya estaban en `approved` y `ready_to_publish`, o sea a punto de
   * salir sin la referencia que el brief da por hecha.
   *
   * Decisiones:
   *
   * - Solo una lista blanca de columnas. El body dice QUÉ cambiar, no EN QUÉ
   *   columna: mandar `{"status": "published"}` no cambia nada, porque `status`
   *   no está en la lista. `status`, `code`, `project_id`, `created_by` y
   *   `created_at` quedan fuera a propósito: tienen acciones propias con sus
   *   propias reglas.
   * - La URL se valida antes de guardar. Un `javascript:` o un `data:` en
   *   `reference_urls` llegaría a la ficha y a `ReferenceWithBrief`; solo se
   *   acepta `http` y `https`, y se exige que tenga host.
   * - No se escribe evento. Como el guion: corregir un campo no es un cambio de
   *   fase, y un evento con `from_status = to_status` por cada coma sería ruido
   *   en la trazabilidad.
   */
  if (action === 'update') {
    // Lista positiva, no "bloquear al que no puede". La negativa dejaba pasar a
    // `client_approver` (rol de aprobar) y a cualquier rol con una errata en la
    // base. Lo que no está en la lista, no edita.
    if (!PUEDE_EDITAR.includes(role)) {
      return error('Tu rol no edita la pieza. Puedes comentar para pedir el cambio.', 403);
    }

    // `null` vale: es como se BORRA un campo (quitar una fecha, quitar un
    // enlace). Sin él en el tipo, no se puede limpiar nada.
    const cambios: Record<string, string | string[] | null> = {};

    const titulo = str(body.title, 200);
    if (titulo) cambios.title = titulo;

    for (const [campo, largo] of [
      ['description', 2000],
      ['objective', 1000],
      ['camera_brief', 2000],
      ['talent_brief', 2000],
      ['edit_brief', 2000],
    ] as const) {
      if (campo in body) {
        const valor = str(body[campo], largo);
        if (valor) cambios[campo] = valor;
      }
    }

    if ('referenceUrls' in body) {
      const crudo = Array.isArray(body.referenceUrls) ? body.referenceUrls : [body.referenceUrls];
      const validas: string[] = [];
      for (const u of crudo) {
        const texto = str(u, 500);
        if (!texto) continue;
        let parseada: URL;
        try {
          parseada = new URL(texto.trim());
        } catch {
          return error(`"${texto}" no es una dirección válida.`, 400);
        }
        // Solo http(s). Un `javascript:` en la referencia se ejecutaría al
        // pincharla, así que no se guarda aunque "parezca" una URL.
        if (parseada.protocol !== 'http:' && parseada.protocol !== 'https:') {
          return error(`Solo se aceptan direcciones http o https. "${texto}" es ${parseada.protocol}`, 400);
        }
        if (!parseada.host) return error(`"${texto}" no tiene dominio.`, 400);
        validas.push(parseada.toString());
      }
      // Guardar la lista vacía SÍ vale: es como se quita una referencia mala.
      cambios.reference_urls = validas;
    }

    /**
     * MEDIDO 2026-10-01: la fecha de salida y el enlace de publicación son
     * columnas que existen y funcionan (`due_at`, `published_url`), pero el
     * endpoint no las aceptaba. La pantalla de publicaciones lo decía así:
     *
     *   "…lo que todavía no se puede registrar es la fecha de salida y el
     *    enlace de publicación… esa migración NO está aplicada en la base."
     *
     * La columna no era el problema: nadie había conectado el campo. Con esto,
     * 58 ideas vivas pueden pasar de una cola sin fecha a un plan.
     *
     * La fecha se VALIDA antes de guardarse. Una fecha inválida en `due_at`
     * revienta la consulta entera, y con ella todos los demás campos del mismo
     * formulario: alguien que escribe mal la fecha pierde el título, el
     * objetivo y los briefs. Se devuelve 400 nombrando el campo.
     */
    if ('dueAt' in body) {
      const crudo = str(body.dueAt, 40);
      if (!crudo) {
        // Vacío explícito vale: es cómo se quita la fecha.
        cambios.due_at = null;
      } else {
        const fecha = new Date(crudo);
        if (Number.isNaN(fecha.getTime())) {
          return error(`"${crudo}" no es una fecha válida.`, 400);
        }
        cambios.due_at = fecha.toISOString();
      }
    }

    if ('publishedUrl' in body) {
      const crudo = str(body.publishedUrl, 500);
      if (!crudo) {
        // Vacío vale: la pieza sale pero todavía no se ha publicado.
        cambios.published_url = null;
      } else {
        let parseada: URL;
        try {
          parseada = new URL(crudo.trim());
        } catch {
          return error(`"${crudo}" no es una dirección válida.`, 400);
        }
        // Solo http(s), por lo mismo que las referencias: un `javascript:` en
        // el enlace de salida se ejecuta al pincharlo.
        if (parseada.protocol !== 'http:' && parseada.protocol !== 'https:') {
          return error(`Solo se aceptan direcciones http o https. "${crudo}" es ${parseada.protocol}`, 400);
        }
        if (!parseada.host) return error(`"${crudo}" no tiene dominio.`, 400);
        cambios.published_url = parseada.toString();
      }
    }

    if (!Object.keys(cambios).length) {
      return error('No hay nada que actualizar.', 400);
    }

    const { error: updateError } = await service
      .from('rr_hub_ideas')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', ideaId);
    if (updateError) return error(updateError.message, 500);

    return NextResponse.json({ success: true, actualizado: Object.keys(cambios) });
  }

  /**
   * Votar una idea en revisión interna.
   *
   * Lo que pidió Santiago el 2026-09-28: que la idea pase por revisión interna
   * con votación antes de mandarse al cliente, y que en la ficha se vea cuántas
   * votaciones lleva.
   *
   * Decisiones que no son obvias:
   *
   * - El votante NO es la sesión. Antes de encender el acceso, el hub estaba abierto y la
   *   identidad la daba un token opaco que el navegador generaba la primera vez,
   *   sin nombre ni correo. Eso era un clic, no un voto. Con el acceso
   *   encendido, el voto es de alguien que entró con su correo y cuya fila está
   *   en la lista blanca del equipo y activa.
   *
   * - Se puede CAMBIAR el voto, no solo emitirlo. Un voto irrevocable obliga a
   *   acertar la primera vez; la `unique (idea_id, voter_token)` es la que impide
   *   que dos clics seguidos cuenten como dos personas.
   *
   * - La regla es MAYORÍA SIMPLE (más `yes` que `no`), la que eligió Santiago. Se
   *   calcula aquí y no con un CHECK en la tabla porque depende del conteo, y un
   *   CHECK no puede contar filas de otra tabla.
   *
   * - Quien puede votar: los tres requisitos juntos —sesión, lista blanca del
   *   equipo, fila activa—. El correo sale de la SESIÓN del servidor, nunca del
   *   cuerpo de la petición: aceptar `voterEmail` del cliente sería votar en
   *   nombre de otro con una línea de código. La base lo repite por su cuenta en
   *   `rr_hub_can_vote_by_email()`, dentro de la política de la tabla, para que
   *   la regla no dependa de que esta ruta se mantenga.
   */
  if (action === 'vote') {
    const token = str(body.voterToken, 100);
    if (!token) return error('Falta el token de votante.', 400);

    // Las cuatro respuestas, no dos. Santiago, 2026-09-29: hacía falta poder
    // decir "ni sí ni no, hay que cambiar algo" dentro de la votación, y poder
    // dejar una nota sin bloquear.
    //
    // La lista sale de `flow.ts` (DECISIONES_VOTO), no de una comparación
    // escrita aquí: si el dominio crece y esta validación no, la base acepta un
    // valor que el conteo no reconoce y la votación se queda trabada sin error.
    const decision = str(body.decision, 10) as DecisionVoto;
    if (!DECISIONES_VOTO.includes(decision)) {
      return error('La respuesta debe ser "yes", "no", "change" o "note".', 400);
    }

    // `change` y `note` son inútiles sin texto, y aquí se comprueba antes de
    // tocar la base. El mismo requisito está como `check` en la tabla: que la
    // interfaz pueda romperse no significa que el dato pueda entrar roto.
    const nota = str(body.note, 800);
    if ((decision === 'change' || decision === 'note') && !nota) {
      return error(
        decision === 'change'
          ? 'Pedir un cambio sin decir cuál no sirve de nada. Escribe qué hay que cambiar.'
          : 'La nota va vacía. Escribe lo que quieras que sepas.',
        400,
      );
    }

    // MEDIDO 2026-10-04: `project_id` se pide aquí porque más abajo se comprueba
    // el acceso del cliente a ESTE proyecto. Antes solo se pedía `status` y la
    // idea no traía el proyecto, así que no había contra qué comprobar nada.
    const { data: idea, error: ideaError } = await supabase
      .from('rr_hub_ideas').select('status, project_id').eq('id', ideaId).maybeSingle();
    if (ideaError) return error(ideaError.message, 500);
    if (!idea) return error('La idea no existe.', 404);

    // Solo se vota lo que está abierto a votación. Aceptar votos en `draft` o en
    // `pending_approval` dejaría votos fantasma de una votación que ya se cerró.
    if (idea.status !== 'voting') {
      return error(`Esta idea no está en votación (está en ${idea.status}).`, 409);
    }

    // La identidad del voto, en este orden (2026-09-28, Santiago encendió el
    // acceso): el voto es SIEMPRE DE ALGUIEN, y ese alguien tiene que haber
    // entrado con su correo. Sin sesión no hay voto: un token suelto no es una
    // persona, y antes bastaba con inventar uno y el conteo que decide si una
    // pieza avanza al cliente lo podía falsear cualquiera que abriera la URL.
    //
    // Tres condiciones, y las tres se comprueban contra la base, no contra el
    // cuerpo de la petición: correo de la SESIÓN, fila en la lista blanca del
    // equipo (`is_team_member`), y fila activa. Que alguien se registrara ayer
    // no lo hace miembro del equipo.
    //
    // MEDIDO 2026-10-03. Antes: `body.voterEmail` NO se miraba, y la identidad
    // era el correo de la SESIÓN. Consecuencia medida: quien entraba al tablero
    // sin puerta veía un cartel de SOLO LECTURA y no podía votar — y la
    // votación interna es justamente lo que el equipo hace sin ser cliente.
    //
    // Ahora la identidad es `body.voterProfile`: el perfil QUE SE ELIGE en la
    // pantalla. Lo que no cambia:
    //
    // - El token del navegador sigue siendo la clave del upsert. Es lo que
    //   impide que una sola máquina emita los votos de tres personas: la fila
    //   sigue siendo `UNIQUE (idea_id, voter_token)`.
    // - El correo se comprueba contra la base, no contra el cuerpo. Escribir el
    //   de otra persona no vota en su nombre: se busca su fila en
    //   `rr_hub_profiles` y, si no es del equipo o está desactivada, se rechaza.
    // - Sin perfil elegido se cae al correo de la sesión, que es lo que pasaba
    //   antes. Nadie que votaba antes deja de poder votar.
    const perfilPedido = str(body.voterProfile, 200);
    const identidad = perfilPedido || email;
    if (!identidad) {
      return error('Elige con qué perfil vas a votar antes de emitir tu voto.', 400);
    }

    const { data: enEquipo } = await service
      .from('rr_hub_profiles')
      .select('id, email, is_team_member, is_active')
      .ilike('email', identidad)
      .maybeSingle();
    if (!enEquipo) {
      return error('Ese correo no está en la lista del equipo.', 403);
    }
    if (!enEquipo.is_active) {
      return error('Tu fila está desactivada, así que por ahora no cuentan tus votos.', 403);
    }

    // MEDIDO 2026-10-04, Santiago: «crea dos perfiles para el cliente para que se
    // puedan reconocer como tal y votar». El bloqueo de `is_team_member` impedía
    // justo eso: el cliente ve el tablero, puede opinar sobre lo que le
    // muestran, y el servidor le decía que no era del equipo.
    //
    // Ahora hay DOS clases de quien puede votar, y las dos se comprueban contra
    // la base, nunca contra el cuerpo de la petición:
    //
    // 1. El EQUIPO: `is_team_member = true`. Vota en cualquier cliente.
    // 2. El CLIENTE: `is_team_member = false` pero con fila en `rr_hub_access`
    //    para ESTE proyecto. Vota solo aquí.
    //
    // Lo que sigue igual: se busca la fila por correo, una fila desactivada no
    // vota, y el correo que se guarda es el de la BASE, nunca el que vino en el
    // cuerpo. Escribir el de otra persona sigue sin votar en su nombre.
    if (!enEquipo.is_team_member) {
      const { data: acceso } = await service
        .from('rr_hub_access')
        .select('role_in_project')
        .eq('user_id', enEquipo.id)
        .eq('project_id', idea.project_id)
        .maybeSingle();
      if (!acceso) {
        return error(
          'Tu cuenta existe pero no tienes acceso a este cliente. Pídeselo a quien administra el hub.',
          403,
        );
      }
    }
    const votanteEmail: string = enEquipo.email;

    // Se marca como visto para que el tablero pueda decir quién está en línea.
    await service
      .from('rr_hub_profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', enEquipo.id);

    // Upsert en vez de insert: cambiar la respuesta es legítimo, duplicarla no.
    // La nota solo se guarda en `change` y `note`; en `yes` y `no` se manda a
    // null para que un voto anterior con nota no se quede pegado a un "sí".
    const { error: voteError } = await service.from('rr_hub_votes').upsert(
      {
        idea_id: ideaId,
        voter_token: token,
        decision,
        voter_email: votanteEmail,
        note: decision === 'change' || decision === 'note' ? nota : null,
      },
      { onConflict: 'idea_id,voter_token' },
    );
    if (voteError) return error(voteError.message, 500);

    // El conteo se relee de la tabla, nunca se calcula con lo que el cliente dijo.
    const { data: votos, error: countError } = await service
      .from('rr_hub_votes').select('decision').eq('idea_id', ideaId);
    if (countError) return error(countError.message, 500);

    const aFavor = (votos ?? []).filter((v) => v.decision === 'yes').length;
    const enContra = (votos ?? []).filter((v) => v.decision === 'no').length;
    const cambiosPedidos = (votos ?? []).filter((v) => frenaLaVotacion(v.decision as DecisionVoto)).length;
    // El detalle, no solo el conteo. Santiago, 2026-09-29: "cuando votas que sí,
    // tu voto se va reflejado como un emoji de manito hacia arriba".
    //
    // Un contador dice "3" y no dice si son tres pulgares o tres cambios. La
    // lista de decisiones es lo que permite pintar un pulgar por persona, y es
    // lo que hace que el voto se vea al instante en vez de tener que suponerlo.
    const detalle = (votos ?? []).map((v) => (v.decision as DecisionVoto));
    const gano = ganoLaVotacion(aFavor, enContra);
    const perdio = perdioLaVotacion(aFavor, enContra);
    const comoVa = estadoVotacion(aFavor, enContra);
    const faltan = votosParaDecidir(aFavor, enContra);

    // El estado al que se mueve la idea lo decide el motor, no esta acción.
    const SALIDA_VOTACION = salidaDeLaVotacion();
    if (!SALIDA_VOTACION) return error('La votación no tiene salida a revisión del cliente.', 500);
    const ESTADO_VOTANDO = idea.status;

    // Un empate, o una votación que todavía no tiene suficientes votos, deja la
    // idea donde está. Nadie avanza por hablar más fuerte, y tampoco por ser el
    // primero en pulsar: hacen falta `VOTOS_NECESARIOS` (tres) para que decida.
    if (gano) {
      const { error: moveError } = await service
        .from('rr_hub_ideas')
        .update({ status: SALIDA_VOTACION, updated_at: new Date().toISOString() })
        .eq('id', ideaId)
        // El `eq` de estado es lo que evita la doble salida: si entre el conteo y
        // esta actualización alguien cerró la votación, no se sobrescribe.
        .eq('status', ESTADO_VOTANDO);
      if (moveError) return error(moveError.message, 500);

      const { data: movida } = await service
        .from('rr_hub_ideas').select('status').eq('id', ideaId).maybeSingle();
      if (movida?.status === SALIDA_VOTACION) {
        await service.from('rr_hub_events').insert({
          idea_id: ideaId, from_status: ESTADO_VOTANDO, to_status: SALIDA_VOTACION,
          comment: `Aprobada por votación interna: ${aFavor} a favor, ${enContra} en contra (mínimo ${VOTOS_NECESARIOS}).`,
          actor_label: 'VOTACIÓN INTERNA',
        });
      }
    }

    // Y el espejo: si la votación se decidió en contra, la pieza CAE. Antes esta
    // rama no existía y `perdioLaVotacion()` no se usaba en ningún sitio: tres
    // votos en contra devolvían `votacion: "perdida"` y la idea se quedaba en
    // `voting` para siempre, con la interfaz diciendo una cosa y la base otra.
    // Medido en producción el 2026-09-29.
    if (perdio) {
      const CAIDA = caidaDeLaVotacion();
      if (!CAIDA) return error('La votación no tiene salida de vuelta a revisión interna.', 500);

      const { error: bajaError } = await service
        .from('rr_hub_ideas')
        .update({ status: CAIDA, updated_at: new Date().toISOString() })
        .eq('id', ideaId)
        .eq('status', ESTADO_VOTANDO);
      if (bajaError) return error(bajaError.message, 500);

      const { data: bajada } = await service
        .from('rr_hub_ideas').select('status').eq('id', ideaId).maybeSingle();
      if (bajada?.status === CAIDA) {
        await service.from('rr_hub_events').insert({
          idea_id: ideaId, from_status: ESTADO_VOTANDO, to_status: CAIDA,
          comment: `Descartada por votación interna: ${aFavor} a favor, ${enContra} en contra. Vuelve a revisión interna.`,
          actor_label: 'VOTACIÓN INTERNA',
        });
      }
    }

    if (frenaLaVotacion(decision) && hayCambioPedido(cambiosPedidos)) {
      const REVISION = salidaDelCambioPedido();
      if (!REVISION) return error('La votación no tiene salida de vuelta a revisión interna.', 500);

      // A diferencia de `gano` y `perdio`, esto no depende de un recuento de
      // mínimos: basta con que alguien haya pedido un cambio. Se comprueba que
      // la idea SIGA en votación para no pisar una salida que ya ocurrió.
      const { error: frenoError } = await service
        .from('rr_hub_ideas')
        .update({ status: REVISION, updated_at: new Date().toISOString() })
        .eq('id', ideaId)
        .eq('status', ESTADO_VOTANDO);
      if (frenoError) return error(frenoError.message, 500);

      const { data: frenada } = await service
        .from('rr_hub_ideas').select('status').eq('id', ideaId).maybeSingle();
      if (frenada?.status === REVISION) {
        await service.from('rr_hub_events').insert({
          idea_id: ideaId, from_status: ESTADO_VOTANDO, to_status: REVISION,
          comment: `Cambio pedido en la votación (${cambiosPedidos}). Vuelve a revisión interna: ${nota}`,
          actor_label: 'VOTACIÓN INTERNA',
        });
      }
    }

    return NextResponse.json({
      success: true, decision, aFavor, enContra, gano,
      // `estado` es el estado real, no el esperado: se relee de la base, así que
      // si la votación no decidió, la respuesta lo dice en vez de dejar creer que
      // la pieza se movió. `votacion` y `faltan` son para el texto que lo explica:
      // sin ellos, quien vota ve "1 a favor" y no sabe si eso decidía algo.
      estado: gano
        ? SALIDA_VOTACION
        : perdio
          ? caidaDeLaVotacion() ?? idea.status
          : frenaLaVotacion(decision) && hayCambioPedido(cambiosPedidos)
            ? salidaDelCambioPedido() ?? idea.status
            : idea.status,
      votacion: comoVa,
      faltan,
      minimo: VOTOS_NECESARIOS,
      // Cuántos cambios se han pedido. La interfaz lo dice, porque la pieza acaba
      // de volver a revisión interna y el equipo tiene que saber por qué.
      cambiosPedidos,
      // La lista completa de respuestas, para pintar un emoji por persona.
      detalle,
    });
  }

  /**
   * Asignar responsable.
   *
   * En modo abierto todo cambio queda como "sin sesión", y eso es honesto pero
   * inútil: nadie sabe a quién preguntarle por la pieza. Esta acción deja que se
   * nombre a una persona REAL del roster, y escribe esa persona en
   * `rr_hub_ideas.created_by`, que es la columna que ya existía para eso y nunca
   * se usaba.
   *
   * La autoridad NO viene del body: el `userId` se resuelve contra
   * `rr_hub_access` en el servidor, y se comprueba que esa persona tenga acceso
   * al proyecto. Mandar un id inventado desde el navegador no asigna nada.
   *
   * No es un `transition`, así que no valida contra `allowedTransitions()`: es
   * metadata, no un cambio de fase. Aun así exige `owner`, porque nombrar a
   * alguien como responsable de una pieza es una decisión de dirección.
   */
  /**
   * Borrar una idea.
   *
   * "Borrar" aquí significa ARCHIVAR: la fila se queda, con `archived_at` y
   * `archived_by`, y desaparece del tablero. No es un `DELETE`.
   *
   * Por qué no un DELETE de verdad, aunque el botón se llame borrar:
   *
   * - Un `DELETE` en cascada borra también los votos y los comentarios. Votos que
   * Contaron tres aprobaciones y luego desaparecen. Eso rompe la regla de que la
   *   votación tiene memoria, y hace que el resultado de una pieza sea
   *   indefendible después.
   * - Nadie puede deshacer un `DELETE`. Con varias personas trabajando, el
   *   "borra esto que se me coló" llega siempre tarde.
   *
   * El borrado real se reserva para ideas que no han salido de casa. Lo decide
   * `PUEDE_BORRAR_ESTADOS` en `flow.ts`: solo `draft` e `internal_review`. Si la
   * pieza ya se votó o salió, el endpoint responde que se archive, y para eso está
   * `archive`.
   *
   * El permiso NO viene del body. Es el rol que el servidor resolvió de
   * `rr_hub_access`, y solo `owner` pasa la lista.
   */
  /**
   * Borrar una idea.
   *
   * "Borrar" aquí significa ARCHIVAR: la fila se queda, con `archived_at` y
   * `archived_by`, y desaparece del tablero. No es un `DELETE`.
   *
   * Por qué no un DELETE de verdad, aunque el botón se llame borrar:
   *
   * - Un `DELETE` en cascada se lleva los votos y los comentarios. Una pieza que
   *  se aprobó con tres sí y luego desaparece deja de tener resultado, y nadie
   *  puede reconstruir por qué salió. Eso rompe la regla de que la votación tiene
   *  memoria.
   * - Nadie puede deshacer un `DELETE`. Con varias personas trabajando, el
   *  "borra esto que se me coló" llega siempre tarde.
   *
   * El borrado real se reserva para ideas que no han salido de casa. Lo decide
   * `PUEDE_BORRAR_ESTADOS` en `flow.ts`: solo `draft` e `internal_review`. Si la
   * pieza ya se votó, se produjo o salió, responde 409 y la vía es archivar.
   *
   * El permiso NO viene del body: es el rol que el servidor resolvió con
   * `roleForIdea`, y solo `owner` pasa `PUEDE_BORRAR`.
   */
  if (action === 'borrar') {
    const ideaId = str(body.ideaId, 64);
    if (!ideaId) return error('Falta la idea.', 400);

    const role: RoleKey | null = await resolverRol(ctx, ideaId, str(body.actorProfile, 200));
    if (!role) return error('No se pudo comprobar tu acceso a esa idea.', 403);
    if (!PUEDE_BORRAR.includes(role)) {
      return error('Solo Dirección borra ideas. Si una pieza sobra, avísame y la archivo.', 403);
    }

    const { data: idea, error: errorIdea } = await service
      .from('rr_hub_ideas')
      .select('id, status, title, archived_at')
      .eq('id', ideaId)
      .maybeSingle();
    if (errorIdea) {
      console.error('[borrar] no se pudo leer la idea:', errorIdea.message);
      return error('No pudimos comprobar la idea.', 500);
    }
    if (!idea) return error('Esa idea ya no existe.', 404);
    if (idea.archived_at) return NextResponse.json({ ok: true, yaArchivada: true, mensaje: 'Esa idea ya estaba fuera del tablero.' });

    if (!PUEDE_BORRAR_ESTADOS.includes(idea.status as WorkflowStatus)) {
      return error(
        `"${idea.title}" ya no es un borrador: está en ${idea.status}. Se archiva en vez de borrarse, para no perder los votos ni los comentarios.`,
        409,
      );
    }

    const { data: borrada, error: errorBorrar } = await service
      .from('rr_hub_ideas')
      .update({ archived_at: new Date().toISOString(), archived_by: userId })
      .eq('id', ideaId)
      // `.is()`, NO `.eq(..., null)`. PostgREST traduce `.eq(col, null)` a
      // `col=eq.null`, que busca la cadena de texto "null" y no casa con el valor
      // NULL. Con `.eq` no se actualizaba ninguna fila, `maybeSingle()` devolvía
      // null y la API respondía 500 sin borrar nada. `.is()` sí genera
      // `col=is.null`, que es lo que hace falta para el "solo si sigue viva".
      .is('archived_at', null)
      .select('id, archived_at')
      .maybeSingle();
    if (errorBorrar || !borrada) {
      console.error('[borrar] no se pudo archivar:', errorBorrar?.message);
      return error('No pudimos borrar la idea.', 500);
    }

    // La trazabilidad necesita un evento. Sin él, la idea desaparece del tablero
    // y nadie sabe que existió ni quién la quitó.
    //
    // `rr_hub_events` no tiene columna `kind`: el tipo de evento se deduce de
    // `from_status` contra `to_status`. Como archivar NO cambia la fase, el
    // evento va con la fase igual en ambos lados y el texto dice qué pasó. Es la
    // misma convención que usa `assign`: un cambio de metadata se registra con
    // `from_status = to_status` y la interfaz lo marca como "sin cambio de fase".
    await service.from('rr_hub_events').insert({
      idea_id: ideaId,
      actor_id: userId,
      from_status: idea.status,
      to_status: idea.status,
      comment: `Borrada del tablero por ${email}`,
    });

    return NextResponse.json({
      ok: true,
      borrada: true,
      mensaje: `"${idea.title}" está fuera del tablero. La idea y su historial siguen guardados.`,
    });
  }

  if (action === 'assign') {
    if (role !== 'owner') return error(`Solo el owner puede asignar responsable. Tu rol es ${ROLE_LABEL[role]}.`, 403);

    const asignado = str(body.userId, 64);
    if (!asignado) return error('Falta el responsable.', 400);

    // El proyecto se resuelve por el slug del body, no desde una variable que
    // no existe en este scope: la comprobación tiene que ser "esta persona tiene
    // acceso a ESTE proyecto", y para eso hace falta el id del proyecto.
    const slug = str(body.projectSlug, 60);
    if (!slug) return error('Falta projectSlug.', 400);
    const { data: proyecto } = await service
      .from('rr_hub_projects').select('id').eq('slug', slug).maybeSingle();
    if (!proyecto) return error('Ese proyecto no existe.', 404);

    const { data: existe } = await service
      .from('rr_hub_access')
      .select('user_id, role_in_project')
      .eq('user_id', asignado)
      .eq('project_id', proyecto.id)
      .maybeSingle();
    if (!existe) return error('Esa persona no tiene acceso a este proyecto.', 400);

    const { data: perfil } = await service
      .from('rr_hub_profiles')
      .select('full_name, email')
      .eq('id', asignado).maybeSingle();

    const { error: updateError } = await service
      .from('rr_hub_ideas')
      .update({ created_by: asignado, updated_at: new Date().toISOString() })
      .eq('id', ideaId);
    if (updateError) return error(updateError.message, 500);

    const nombre = perfil?.full_name ?? 'RR Aliados';

    // `to_status` es NOT NULL y `from_status` es nullable, sin CHECK que
    // compruebe nada: es la tabla de transiciones, no un log genérico. La
    // primera versión mandaba `to_status: null` y el alta entera fallaba con
    // "violates not-null constraint" — la asignación escribía el responsable y
    // el evento se caía, dejando la pieza con un cambio sin rastro.
    //
    // La solución NO es relajar la columna: es escribir el estado REAL de la
    // pieza, para que `from_status = to_status` se lea como "no cambió de fase".
    // Así el evento sigue siendo legible en la línea de tiempo y la tabla
    // conserva su contrato.
    const { data: estadoActual } = await service
      .from('rr_hub_ideas').select('status').eq('id', ideaId).maybeSingle();
    const estado = (estadoActual?.status as string) ?? 'draft';

    const { error: eventError } = await service.from('rr_hub_events').insert({
      idea_id: ideaId, from_status: estado, to_status: estado,
      comment: `Responsable asignado: ${nombre}${perfil?.email ? ` (${perfil.email})` : ''}. No cambió de fase.`,
      actor_label: `${email ?? 'sin sesión'} · ${ROLE_LABEL[role]}`,
      actor_id: userId,
    });
    if (eventError) return error(eventError.message, 500);

    return NextResponse.json({ success: true, nombre });
  }

  if (action === 'comment') {
    // Comentar es la vía para pedir un cambio, así que es de cualquiera del
    // equipo — incluido quien solo mira. Lo que no se permite es que un rol sin
    // acceso (o con una errata) escriba: para eso está la lista positiva.
    //
    // MEDIDO 2026-10-03. El autor sale del PERFIL ELEGIDO (`body.authorProfile`),
    // no de la sesión. Con el hub en puerta por código la mayoría de las veces no
    // hay sesión, y el bloque de comentarios —que es la parte del hub que más se
    // usa sin ser cliente— respondía «Entra con el código de tu cliente». MEDIDO
    // en producción: el comentario no se publicaba.
    //
    // Lo que no cambia: el perfil se comprueba contra `rr_hub_profiles`
    // (`is_team_member` e `is_active`), no contra el cuerpo de la petición.
    // Escribir el nombre de otra persona no publica en su nombre. Y sin perfil
    // válido se cae al correo de la sesión, que es lo que pasaba antes.
    const text = str(body.body, 4000);
    if (!text) return error('El comentario está vacío.', 400);

    const perfil = str(body.authorProfile, 200);
    const identidad = perfil || email;
    if (!identidad) {
      return error('Elige con qué perfil comentas antes de publicar.', 400);
    }

    const { data: enEquipo } = await service
      .from('rr_hub_profiles')
      .select('id, email, full_name, is_team_member, is_active')
      .ilike('email', identidad)
      .maybeSingle();
    if (!enEquipo) return error('Ese correo no está en la lista del equipo.', 403);
    if (!enEquipo.is_team_member) {
      return error('Tu cuenta existe pero no eres del equipo. Pídeselo a quien administra el hub.', 403);
    }
    if (!enEquipo.is_active) {
      return error('Tu fila está desactivada, así que por ahora no cuentan tus comentarios.', 403);
    }

    // El ROL sale de la fila del proyecto si la hay. Si no la hay, el comentario
    // sigue siendo válido: comentar no mueve la pieza, y el hilo es lo que hace
    // falta para pedir un cambio. Antes esto exigía rol y por eso sin sesión no
    // había manera de comentar.
    // El proyecto sale de la IDEA, no del slug que dice el cuerpo. MEDIDO: con la
    // puerta por código `ctx.proyecto` es el cliente con el que se entró, que no
    // tiene por qué ser el dueño de esta idea. Consultar la fila de acceso con
    // ese slug daría el rol de otro cliente.
    const { data: idea } = await service
      .from('rr_hub_ideas').select('project_id').eq('id', ideaId).maybeSingle();
    const { data: acceso } = idea?.project_id
      ? await service
        .from('rr_hub_access')
        .select('role_in_project')
        .eq('user_id', enEquipo.id)
        .eq('project_id', idea.project_id)
        .maybeSingle()
      : { data: null as { role_in_project: string } | null };
    const rolDelProyecto = (acceso?.role_in_project as RoleKey | undefined) ?? null;
    if (rolDelProyecto && !PUEDE_COMENTAR.includes(rolDelProyecto)) {
      return error('Tu rol no está en el equipo de este proyecto.', 403);
    }

    const nombreAutor = (enEquipo.full_name as string | null) ?? enEquipo.email;
    const { error: insertError } = await service.from('rr_hub_comments').insert({
      idea_id: ideaId, body: text,
      role_label: rolDelProyecto ? ROLE_LABEL[rolDelProyecto] : 'EQUIPO',
      author_label: `${nombreAutor} · EQUIPO`,
    });
    if (insertError) return error(insertError.message, 500);
    return NextResponse.json({ success: true });
  }

  if (action === 'resolve-comment') {
    // Marcar un comentario como resuelto es decir que ya se hizo: es una decisión
    // sobre la pieza, no una opinión. Por eso no es de cualquiera, como comentar.
    // `comment` una rama más arriba sí lo exige; esta se había quedado sin puerta.
    if (!PUEDE_EDITAR.includes(role)) {
      return error('Tu rol no resuelve comentarios. Puedes comentar para pedirlo.', 403);
    }
    const commentId = str(body.commentId, 64);
    if (!commentId) return error('Falta commentId.', 400);
    const { error: updateError } = await service
      .from('rr_hub_comments')
      .update({ resolved_at: isResolved(body.resolved) ? new Date().toISOString() : null })
      .eq('id', commentId)
      .eq('idea_id', ideaId);
    if (updateError) return error(updateError.message, 500);
    return NextResponse.json({ success: true });
  }

  if (action === 'asset') {
    // MEDIDO 2026-10-03: esta accion NUNCA miro a que cliente pertenece la
    // idea. `roleForIdea` (arriba, linea 201) devuelve el rol de quien llama
    // para ESA idea, asi que el unico filtro real era el path. Reproducido en
    // produccion: con la sesion de Wundeer se registro un asset dentro de una
    // idea de Candilejas y la API respondio `{"success":true}`. Sin esto, con
    // el codigo de Wundeer se cuelgan archivos en la carpeta de Candilejas,
    // igual que ya hacia `/api/subir` con su propio chequeo.
    //
    // El rol no alcanza: tener rol `creator` en Wundeer dice que puedes operar
    // en Wundeer, no que puedas escribir en el banco de Candilejas.
    const { data: ideaConProyecto, error: ideaProyectoError } = await supabase
      .from('rr_hub_ideas')
      .select('project:rr_hub_projects!inner(slug)')
      .eq('id', ideaId)
      .maybeSingle();
    if (ideaProyectoError) return error('No se pudo comprobar el cliente de la idea.', 500);
    const proyectoRelacionado = ideaConProyecto?.project as { slug?: string } | { slug?: string }[] | undefined;
    const slugIdea = Array.isArray(proyectoRelacionado) ? proyectoRelacionado[0]?.slug : proyectoRelacionado?.slug;
    if (!slugIdea) return error('Esa idea no existe.', 404);
    if (ctx.proyecto && slugIdea !== ctx.proyecto) {
      return error('Esa idea no es de tu cliente.', 403);
    }

    // The object itself was uploaded by the browser with the session token, so
    // RLS on storage.objects decided whether that was allowed. The service
    // client only writes the metadata row, after checking the path belongs to
    // this idea and to this session.
    // En modo abierto no hay id de sesión que atar a la ruta: se usa un
    // marcador fijo y explícito. Así el path sigue siendo verificable y además
    // dice a simple vista que la subida vino sin quien.
    const check = validateAssetPath(str(body.path, 300), ideaId, userId ?? SIN_QUIEN);
    if ('pathError' in check) return error(check.pathError, 400);
    if (check.assetPath.split('/')[0] !== slugIdea) {
      return error('La ruta del archivo no corresponde al cliente de la idea.', 403);
    }

    const { error: insertError } = await service.from('rr_hub_assets').insert({
      idea_id: ideaId,
      asset_stage: str(body.stage, 40) as never,
      storage_path: check.assetPath,
      file_name: str(body.fileName, 200),
      mime_type: str(body.mimeType, 100) || null,
      version_label: str(body.versionLabel, 80),
    });
    if (insertError) return error(insertError.message, 500);
    return NextResponse.json({ success: true, path: check.assetPath });
  }

  return error('Acción desconocida.', 404);
}

const isResolved = (value: unknown) => value === true || value === 'true';

/**
 * The storage path is built by the browser, so it is verified here. It has to
 * sit under this idea's own folder, which is what stops a member of one project
 * from registering an asset inside another's. The session id is part of the
 * path for the same reason: it ties the object to whoever uploaded it.
 */
function validateAssetPath(
  candidate: string,
  ideaId: string,
  userId: string,
): { assetPath: string } | { pathError: string } {
  if (!candidate) return { pathError: 'Falta la ruta del archivo.' };
  if (candidate.includes('..')) return { pathError: 'Ruta inválida.' };

  // <projectSlug>/<ideaId>/<stage>/<sessionId>-<file>
  const parts = candidate.split('/');
  if (parts.length !== 4) return { pathError: 'Ruta inválida.' };
  if (parts[1] !== ideaId) return { pathError: 'La ruta no corresponde a esta idea.' };
  if (!parts[3].startsWith(userId)) return { pathError: 'La ruta no corresponde a tu sesión.' };
  return { assetPath: candidate };
}

/**
 * El rol que la persona tiene AHORA, para el perfil que eligió en el selector.
 *
 * MEDIDO 2026-10-04. Santiago: «asegúrate de que el perfil de los dos de Wundeer
 * [puedan] entrar desde esos perfiles y poder aprobar». La ficha se renderiza en
 * el servidor sin saber qué perfil se eligió en el celular, así que llegaba con
 * «SIN ACCIÓN DISPONIBLE» — y el botón se decide en el servidor. Este endpoint
 * es el puente: el navegador pregunta su rol con el perfil que tiene en
 * `localStorage` y la ficha pinta lo que ese perfil puede hacer de verdad.
 *
 * Devuelve el rol de la fila, nunca uno pedido por el cliente. Sin sesión y sin
 * perfil elegido devuelve `client_viewer`, que es lo que se ve: solo lectura.
 */
async function miRol(body: Body, ctx: Ctx): Promise<NextResponse> {
  const slug = str(body.projectSlug, 60);
  const identidad = str(body.actorProfile, 200);
  if (!slug) return error('Falta projectSlug.', 400);

  const { data: proyecto } = await ctx.service
    .from('rr_hub_projects').select('id').eq('slug', slug).maybeSingle();
  if (!proyecto) return error('Ese proyecto no existe.', 404);

  // 1. La sesión manda si existe: es la identidad comprobada.
  const sesion = await quienEs();
  if (sesion) {
    const { data: fila } = await ctx.service
      .from('rr_hub_profiles').select('id').ilike('email', sesion.email).maybeSingle();
    if (fila) {
      const { data: acceso } = await ctx.service
        .from('rr_hub_access').select('role_in_project')
        .eq('user_id', fila.id).eq('project_id', proyecto.id).maybeSingle();
      if (acceso?.role_in_project) {
        return NextResponse.json({ role: acceso.role_in_project, via: 'session' });
      }
    }
  }

  // 2. Sin sesión, el perfil declarado: se contrasta contra la base.
  if (identidad) {
    const rol = await roleForPerfilElegido(ctx.service, proyecto.id, identidad);
    if (rol) return NextResponse.json({ role: rol, via: 'perfil' });
  }

  return NextResponse.json({ role: 'client_viewer', via: 'sin-perfil' });
}

/**
 * El roster de un proyecto: quién puede recibir una pieza.
 *
 * Va por el servidor, y no con el cliente de Supabase del navegador, por dos
 * razones que hicieron que la primera versión devolviera una lista vacía:
 *
 * 1. RLS: `rr_hub_access_read` solo deja leer si `user_id = auth.uid()`. Sin
 *    sesión no hay roster — que es lo correcto, es la lista de quién tiene
 *    acceso a cada proyecto — pero en modo abierto no hay `auth.uid()`.
 * 2. **No hay FK entre `rr_hub_access` y `rr_hub_profiles`.** La primera apunta
 *    a `auth.users(id)` y la segunda tiene su propio id. El join anidado
 *    `rr_hub_profiles!inner(...)` devolvía PGRST200, y PostgREST reporta eso como
 *    `data = null`: la interfaz pintaba "no hay nadie" sin decir que la consulta
 *    estaba rota.
 *
 * El cliente `service` salta RLS, que es justo lo que hace falta aquí: la lista
 * no es un secreto, es la misma información que ya está en la barra lateral y en
 * `/audit`. Lo que no se hace es devolver uuid sueltos que no hagan falta.
 */
async function roster(body: Body, ctx: Ctx): Promise<NextResponse> {
  const slug = str(body.projectSlug, 60);
  if (!slug) return error('Falta projectSlug.', 400);

  const { data: proyecto } = await ctx.service
    .from('rr_hub_projects').select('id').eq('slug', slug).maybeSingle();
  if (!proyecto) return error('Ese proyecto no existe.', 404);

  // Que la lista "no sea un secreto" no significa que cualquier sesión la pueda
  // leer. Esta acción salta el chequeo de ideaId porque no va sobre una pieza, y
  // usaba el service role (que ignora RLS) sin mirar quién pregunta. Con solo
  // tener sesión, cualquier cuenta de Supabase se llevaba los 18 correos del
  // equipo. Se cierra exigiendo que la persona sea del equipo de ESE proyecto.
  const veredicto = await rolEnProyecto(proyecto.id);
  if (!veredicto.puedeEscribir && veredicto.rol === 'sin_rol') {
    return error('Necesitas ser parte del equipo para ver la lista.', 403);
  }
  const { data: propio } = await ctx.service
    .from('rr_hub_access')
    .select('user_id')
    .eq('project_id', proyecto.id)
    .eq('user_id', ctx.userId ?? '')
    .maybeSingle();
  if (!propio) {
    return error('Necesitas ser parte del equipo para ver la lista.', 403);
  }

  const { data: accesos, error: accesoError } = await ctx.service
    .from('rr_hub_access')
    .select('user_id, role_in_project')
    .eq('project_id', proyecto.id);
  if (accesoError) return error(accesoError.message, 500);
  if (!accesos?.length) return NextResponse.json({ roster: [] });

  const { data: perfiles } = await ctx.service
    .from('rr_hub_profiles')
    .select('id, full_name, email')
    .in('id', accesos.map((fila: { user_id: string }) => fila.user_id));

  const porId = new Map((perfiles ?? []).map((p: any) => [p.id as string, p]));
  const lista = accesos
    .map((fila: any) => {
      const perfil = porId.get(fila.user_id as string);
      return {
        userId: fila.user_id as string,
        nombre: (perfil?.full_name as string) || (perfil?.email as string) || 'RR Aliados',
        rol: (fila.role_in_project as string) || 'sin_rol',
        email: (perfil?.email as string) ?? null,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return NextResponse.json({ roster: lista });
}

/**
 * Idea creation lives in its own function because it is the one action without
 * an existing idea to authorise against: the role comes from the project in the
 * body, looked up before anything is written.
 */
async function createIdea(body: Body, ctx: Ctx): Promise<NextResponse> {
  const { supabase, service, userId, email } = ctx;
  const projectSlug = str(body.projectSlug, 60);
  const { data: project } = await supabase
    .from('rr_hub_projects').select('id').eq('slug', projectSlug).maybeSingle();
  if (!project) return error('Ese proyecto no existe.', 404);

  const { data: access } = ctx.abierto
    ? { data: null }
    : await supabase
      .from('rr_hub_access').select('role_in_project')
      .eq('user_id', userId!).eq('project_id', project.id).maybeSingle();
  const identidad = str(body.actorProfile, 200);
  const creatorRole: RoleKey | undefined =
    (access?.role_in_project as RoleKey | undefined)
    ?? (email && isSuperAdmin(email) ? 'owner' : undefined)
    ?? (identidad ? (await roleForPerfilElegido(service, project.id, identidad)) ?? undefined : undefined);
  if (!creatorRole) return unauthorized();

  const title = str(body.title, 160);
  if (title.length < 3) return error('El título necesita al menos 3 caracteres.', 400);
  const contentType = body.contentType === 'paid' ? 'paid' : 'organic';
  /**
   * Las referencias de una idea.
   *
   * MEDIDO 2026-10-04, Santiago: «deja solo una referencia por video». Antes esto
   * aceptaba hasta 10 y las ideas guardaban varias. Lo que se ve en produccion:
   * cuatro ideas con dos referencias, y en dos de ellas la segunda era un anuncio
   * de Facebook Ads Library que no se puede embeber — sale un marco vacío— así
   * que la ficha cargaba dos iframes para mostrar medio negro.
   *
   * Ahora se guarda UNA: la primera que sea de un origen embebible. Si solo
   * llega una no embebible (Facebook Ads Library, que no tiene endpoint público
   * que lo sirva), esa se conserva, porque es la única que alguien eligió y
   * borrarla dejaría la idea sin referencia del todo.
   *
   * Lo que se borra queda en `rr_hub_respaldo_borrado` con el código y el título
   * de la idea, así que recuperar una referencia es una consulta, no una
   * reconstrucción.
   */
  const EMBEBIBLES = [
    /instagram\.com\/reel\//i,
    /instagram\.com\/tv\//i,
    /instagram\.com\//i,
    /youtube\.com|youtu\.be/i,
    /tiktok\.com/i,
    /drive\.google\.com/i,
  ];
  const pedidas = Array.isArray(body.referenceUrls)
    ? body.referenceUrls.map((value) => str(value, 300)).filter((value) => /^https?:\/\//.test(value)).slice(0, 10)
    : [];
  // Una sola referencia: la primera embebible, o la primera que haya llegado si
  // ninguna lo es. `||` y no `??` porque `undefined` es lo que devuelve `find`
  // cuando no encuentra nada.
  const referencia = pedidas.find((u) => EMBEBIBLES.some((rx) => rx.test(u))) || pedidas[0];
  const references = referencia ? [referencia] : [];

  // REGLA DURA 2026-10-06 (Santiago): toda idea DEBE tener al menos una
  // referencia con URL funcional. Sin referencia no se crea la idea.
  if (!referencia) {
    return error(
      'Toda idea necesita al menos un link de referencia (Instagram, TikTok, YouTube, Google Drive o cualquier URL pública). Sin referencia no se crea la idea.',
      400,
    );
  }

  /**
   * El anuncio de la biblioteca, si se eligió uno al crear la pieza.
   *
   * Se guarda el PUNTERO, no el copy del anuncio, y se comprueba que el id sea
   * de ESTE proyecto. Sin esa comprobación, cualquiera podría mandar el id de un
   * anuncio de otro proyecto y colgarlo de una idea suya; y sin guardarlo, la
   * biblioteca no sirve de nada: la idea quedaría con el texto copiado y
   * desincronizado el día que el anuncio se corrija.
   *
   * Un id que no existe, o que es de otro proyecto, NO es un error: la idea se
   * crea igual, sin puntero. Fallar aquí dejaría al equipo sin poder crear
   * piezas por un catálogo que alguien está limpiando por debajo.
   */
  let adId: string | null = null;
  const adPedido = str(body.adId, 64);
  if (adPedido) {
    const { data: anuncio } = await service
      .from('rr_hub_ad_library')
      .select('id, project_id, external_url')
      .eq('id', adPedido)
      .maybeSingle();
    if (anuncio && anuncio.project_id === project.id) {
      adId = anuncio.id as string;
      // Si la pieza viene sin referencia pero con anuncio, la referencia del
      // anuncio ES la referencia: es justo lo que el selector vino a buscar.
      if (!references.length && anuncio.external_url) references.push(String(anuncio.external_url));
    }
  }

  // The code is assigned here, not by the browser, for the same reason as in
  // /api/ideas: a max+1 read in two places at once hands out the same number
  // twice, and the browser is not the only writer.
  const prefix = contentType === 'organic' ? 'O' : 'P';
  // EL ORIGEN NO LO DECLARA EL NAVEGADOR (Santiago, 2026-09-30).
  //
  // Antes era `body.origen === 'asistente' ? 'asistente' : 'manual'`: el cliente
  // mandaba el valor y el servidor se lo creia. Eso queria decir que cualquier
  // persona con sesion podia declarar sus propias ideas como montadas por Hermes,
  // que es justo la distincion que sirve para separar lo revisado de lo que
  // nadie ha mirado. Una insignia que se puede poner a mano no es una insignia.
  //
  // Ahora el servidor decide, y solo por una via: una CABEZA de la API, que es
  // lo que usa el generador. El formulario manual no manda ninguna, asi que
  // sale 'manual' siempre. No es un parametro que se pueda falsear, es una
  // ausencia: el navegador no tiene forma de pedir 'asistente'.
  //
  // Por que una cabecera y no un flag del cuerpo: porque el cuerpo lo controla
  // quien llama, y la cabecera tambien, pero al menos la cabecera se ve en los
  // logs del servidor y no viaja en el JSON que se puede replicar desde otro
  // script. No es criptografia: es que para mentir haya que estar en el servidor.
  const declarado = str(ctx.cabeceras.get(CABEZA_ORIGEN), 20);
  const origen = declarado === 'asistente' ? 'asistente' : 'manual';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: codes } = await service
      .from('rr_hub_ideas').select('code')
      .eq('project_id', project.id).eq('content_type', contentType);
    const next = (codes ?? []).reduce<number>(
      (max, row) => Math.max(max, Number(String((row as { code?: string | null }).code ?? '').replace(/^\D+/, '')) || 0), 0) + 1;

    const { data: idea, error: insertError } = await service.from('rr_hub_ideas').insert({
      project_id: project.id, code: `${prefix}${next}`, title,
      description: str(body.description, 2000) || 'Sin descripción aún.',
      objective: str(body.objective, 500),
      content_type: contentType,
      category: str(body.category, 80) || 'Sin categoría',
      origen,
      // MEDIDO 2026-10-04, Santiago: «que apenas se suba una idea, se abra la
      // votación directa. Que sea como el primer estado posible, que ya no haya
      // un estado anterior sino ese sea el primero». Nace en `voting`, no en
      // `draft`: una idea nueva no espera a que alguien la mueva a mano para que
      // alguien opine sobre ella.
      status: 'voting', priority: 'normal',
      camera_brief: str(body.cameraBrief, 4000),
      talent_brief: str(body.talentBrief, 4000),
      edit_brief: str(body.editBrief, 4000),
      script_content: str(body.script, 60_000),
      reference_urls: references,
      ad_id: adId,
    }).select('id').single();

    if (!insertError && idea) {
      await service.from('rr_hub_events').insert({
        idea_id: idea.id, to_status: 'voting',
        comment: 'Idea creada y abierta a votación en el mismo momento: no hay un estado previo que nadie mire.',
        actor_label: `${email ?? 'sin sesión'} · ${ROLE_LABEL[creatorRole]}`,
      });
      return NextResponse.json({ success: true, id: idea.id });
    }
    // 23505 = unique violation: another writer took this code, recompute.
    if (insertError?.code !== '23505') return error(insertError?.message ?? 'No se pudo crear la idea.', 500);
  }
  return error('No se pudo asignar un código libre tras varios intentos.', 409);
}
