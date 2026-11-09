import type { DecisionVoto } from '@/lib/flow';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { quienEs } from '@/lib/quien-es';
import { DEMO_MODE, SupabaseNotConfiguredError } from './demo-mode';
import { demoEquipo, demoIdeas, demoProjects, getDemoIdea, getDemoProject } from './demo-data';
import {
  ideasDemo as ideasDemoGuardadas,
  ideaDemo as ideaDemoGuardada,
  comentariosDemo,
} from './demo-store';
import { clienteEsVisible, clienteExiste } from './projects';
import { catalogoIncluye } from './config';

/**
 * Data access layer for the RR Content Hub.
 *
 * The hub lives in the same Supabase project as other RR tools, so every table
 * it owns is prefixed `rr_hub_`. These helpers never read the legacy CRM tables.
 *
 * LEE CON LA CLAVE DEL SERVIDOR, y no con la `anon`. No es un descuido ni una
 * comodidad: desde que la puerta es un código por cliente ya no hay sesión de
 * Supabase, así que `auth.uid()` devuelve NULL y el RLS deja pasar a nadie. Un
 * lector anónimo aquí devolvía cero filas en todas partes, y eso se veía como
 * "el tablero está vacío" y "no tienes permiso", nunca como "el RLS está
 * cerrado". Con la clave del servidor el RLS no estorba, y lo que decide quién
 * entra y qué puede hacer es el guard (`project-guard.ts`), que sí sabe quién
 * es porque recibe la cookie firmada.
 *
 * Missing Supabase config used to degrade to demo fixtures. It no longer does:
 * a missing database is a configuration error, and answering it with invented
 * content plus an `admin` role hid real outages. Set `NEXT_PUBLIC_HUB_DEMO=true`
 * to work on the UI without credentials.
 */

/**
 * Called where a missing database used to silently return demo content. In demo
 * mode it yields `null` so the caller's `if (!supabase)` branch still runs; in
 * anything else it throws, because a wrong answer hidden behind a 200 is worse
 * than a visible failure.
 *
 * Returns `true` (not `null`) so `if (requireSupabase()) return fixtures` reads
 * correctly and TypeScript narrows `supabase` to non-null past the guard.
 */
function requireSupabase(): true {
  if (DEMO_MODE) return true;
  throw new SupabaseNotConfiguredError();
}

type RawIdea = Record<string, unknown>;

/**
 * This was the single worst bug in the app: `getIdeas` filtered to four
 * ideation states AND required a non-empty `reference_urls`, but nothing in the
 * write path ever guaranteed a reference. A piece saved without one became
 * invisible the moment it was stored — and because the same filter gated the
 * read, the production and publication queues (which look for `editing`,
 * `published`, …) could never return anything at all.
 *
 * Reads are now unfiltered: the workflow engine (`flow.ts`) is the authority on
 * which states exist, and each queue page already filters for itself.
 */
function mapIdea(row: RawIdea) {
  const urls = Array.isArray(row.reference_urls) ? (row.reference_urls as string[]) : [];
  return {
    id: row.id as string,
    code: (row.code as string) ?? 'IDEA',
    title: row.title as string,
    description: (row.description as string) ?? '',
    objective: (row.objective as string) ?? '',
    content_type: row.content_type as 'organic' | 'paid',
    category: (row.category as string) ?? 'General',
    /**
     * Quien aporto la idea: `manual` la escribio una persona, `asistente` la
     * genero Hermes. Viene de la columna, no de `created_by`: las ideas del
     * generador llevan la identidad administrativa de la sesion y no se podrian
     * distinguir de las manuales por ahi. Un valor raro cae a `manual`, que es la
     * lectura conservadora: se presume intervencion humana.
     */
    origen: (row.origen as string) === 'asistente' ? ('asistente' as const) : ('manual' as const),
    status: row.status as string,
    priority: row.priority as 'high' | 'normal',
    creator: 'RR ALIADOS',
    created_at: row.created_at as string,
    /**
     * MEDIDO 2026-10-02 (auditoria del backend): `mapIdea` reconstruia el objeto
     * campo por campo y se dejaba estos tres, que ya venian en la consulta.
     * Consecuencias medidas, no supuestas:
     *   - sin `updated_at`, `daysSince(idea.updated_at ?? idea.created_at)` caia
     *     siempre a `created_at`: una pieza tocada hoy podia mostrar "14 DIAS SIN
     *     MOVERSE". Es lo que se ve en la tarjeta del tablero y en la cola.
     *   - sin `created_by`, el responsable de la pieza salia siempre vacio.
     *   - sin `ad_id`, la miniatura del anuncio de Facebook nunca cargaba.
     */
    updated_at: (row.updated_at as string) ?? null,
    created_by: (row.created_by as string) ?? null,
    ad_id: (row.ad_id as string) ?? null,
    /**
     * MEDIDO 2026-10-01: la fecha de salida se guardaba y no llegaba a la
     * pantalla. Dos motivos encadenados, y los dos había que arreglarlos:
     *
     * 1. `getIdeas` pedía las columnas una por una y `due_at` no estaba en la
     *    lista, así que el tablero no la recibía.
     * 2. `getIdea` sí usa `select('*')` y la traía... pero `mapIdea()`
     *    RECONSTRUYE el objeto campo por campo, y `due_at` no estaba entre
     *    ellos. Aunque la fila viniera con la fecha, se perdía al mapear.
     *
     * El segundo es el que moria: mi primera prueba miraba el `select('*')` de
     * `getIdea` y daba verde, porque la columna sí venía. La fecha se perdía
     * tres líneas más abajo. Por eso ahora la prueba mira el MAPEO.
     */
    due_at: (row.due_at as string | null) ?? null,
    published_url: (row.published_url as string | null) ?? null,
    /**
     * MEDIDO 2026-10-01: 19 ideas en `voting` con CERO votos, y el botón de
     * votar solo existía dentro de la ficha. Para poder votar desde la tarjeta
     * hace falta que el tablero sepa el conteo ANTES de pintar, o el botón
     * saldría en cero y mostraría "faltan 3" aunque ya hubiera dos.
     *
     * Esto no es un campo de la tabla de ideas: son tres filas de `rr_hub_votes`
     * por idea. Se cuenta aparte, en `conVotos()`, y se adjunta después. Por
     * eso aquí va en cero: `mapIdea` mira una fila, no una agregación.
     */
    aFavor: 0,
    enContra: 0,
    reference_url: urls[0] ?? (row.reference_url as string) ?? '',
    reference_urls: urls,
    /**
     * Portada real de la pieza: el asset `reference_brief` elegido, resuelto por
     * `rr_hub_idea_cover()`. Viene anidado con la relación de la columna
     * `cover_asset_id` (migración 20260928_hub_idea_cover), no con un join por
     * fecha: la columna es la elección explícita y no se recalcula en cada
     * lectura. Es `null` cuando la idea no tiene brief, y ahí la tarjeta vuelve
     * a su portada de marca.
     *
     * `storage_path` no se pide: es una ruta del bucket privado y la app no la
     * puede abrir sin que el servidor la firme. Solo el `external_url` público
     * sirve para pintar.
     */
    cover_asset: Array.isArray(row.cover_asset) ? row.cover_asset[0] ?? null : row.cover_asset ?? null,
    camera: (row.camera_brief as string) ?? '',
    talent: (row.talent_brief as string) ?? '',
    edit: (row.edit_brief as string) ?? '',
    script_content: (row.script_content as string) ?? '',
  };
}

export async function getCurrentUser() {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return { user: null, supabase: null };

  // Desde el 2026-09-28 la puerta es un código por cliente, así que la identidad
  // viene de la cookie firmada del hub. Antes venía de `supabase.auth.getUser()`,
  // que era una ida a la red en cada carga de página; ahora es leer la cookie.
  //
  // La forma es la misma (`user` con `email`), porque quien usa esta función
  // solo necesita saber quién es, no tener una sesión de Supabase.
  const sesion = await quienEs();
  if (!sesion) return { user: null, supabase };

  const { data: perfil } = await supabase
    .from('rr_hub_profiles')
    .select('id, full_name, email, global_role')
    .ilike('email', sesion.email)
    .maybeSingle();
  if (!perfil) return { user: null, supabase };

  return { user: { id: perfil.id, email: perfil.email, name: sesion.nombre }, supabase };
}

export async function getProject(slug: string) {
  const slugNormalizado = slug.trim().toLowerCase();
  if (!(await clienteExiste(slugNormalizado))) return { project: null, access: null, supabase: null };
  if (DEMO_MODE) return { project: getDemoProject(slugNormalizado) ?? null, access: null, supabase: null };

  // SIN PUERTA (2026-10-02). Antes estas cuatro líneas exigían que el slug fuera
  // el del código con el que se entró, y sin cookie devolvían null. Con la puerta
  // abierta eso convertía cada cliente en un 404 para quien llegaba sin sesión:
  // la portada cargaba y el primer enlace llevaba a la nada.
  //
  // Ahora el slug lo decide la URL, que es lo único que queda. `isVisibleProject`
  // de arriba sigue mandando: un slug que no es cliente sigue siendo un 404.
  //
  // LO QUE NO SE ABRE: `access` sigue siendo null sin sesión, y con él la
  // escritura. `access` es lo que leen `ProjectDashboard` para pintar los botones
  // y lo que comprueba el guard de cada mutación (`rr_hub_access`). Ver sin
  // sesión, escribir sin fila de acceso: son dos cosas y siguen separadas.
  const sesion = await quienEs();
  if (!sesion) {
    const sinSesion = await createServiceClient() ?? await createClient();
    if (!sinSesion) return { project: null, access: null, supabase: null };
    const { data: proyecto } = await sinSesion
      .from('rr_hub_projects')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    // `access: null` a proposito: sin sesion no hay fila que consultara y nadie
    // puede escribir. La lectura si va entera.
    return { project: proyecto ?? null, access: null, supabase: sinSesion };
  }

  // MEDIDO 2026-10-03: con sesión, este guard devolvía 404 para CUALQUIER cliente
  // que no fuera el del código con el que se entró. Reproducido en producción:
  //   sesión de WUNDEER → /candilejas 404 · /boga 404 · /satiro 404
  //
  // Y el selector de clientes los ofrece los cuatro: prometerse una puerta que
  // da 404 es la misma clase de fallo que un botón que no lleva a ningún sitio.
  //
  // Lo que SÍ debe seguir cerrado: la ESCRITURA. `access` sigue viniendo de la
  // fila de `rr_hub_access` de esta persona en ESTE proyecto, y si no la tiene
  // queda en null. El guard de cada mutación (`roleForIdea` en
  // `api/workspace/[action]`, `/api/subir`) consulta `access` y rechaza sin ella,
  // así que ver sin acceso y escribir sin acceso siguen siendo dos cosas
  // separadas, como dice el comentario de arriba.
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) {
    // Was `admin` — the role that bypasses every transition rule in flow.ts.
    return { project: null, access: null, supabase: null };
  }

  const { data: project } = await supabase
    .from('rr_hub_projects')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (!project) return { project: null, access: null, supabase };

  // El `sesion` de arriba ya es el bueno: si no hubiera, `getProject` ya habría
  // devuelto null. Así que aquí no se vuelve a preguntar.
  // Se busca por correo en vez de por `user_id`: es la misma fila, y no depende
  // de que exista una sesión de Supabase de la que sacar el id.
  // El cruce es por `user_id`, y se resuelve en memoria: `rr_hub_access.user_id`
  // tiene FK a `auth.users`, `rr_hub_profiles.id` es su propia PK, y ENTRE LAS DOS
  // NO HAY FK (medido el 2026-09-29 en `pg_constraint`). El embed
  // `user:rr_hub_profiles!inner(email)` que estaba aquí devolvía
  // `400 PGRST200` con `data: null` **sin lanzar excepción** — el mismo fallo que
  // dejó a todo el equipo en `sin_rol` en `project-guard.ts`.
  //
  // Aquí el síntoma era distinto y peor: al no encontrar la fila, la función
  // caía al atajo de `global_role === 'admin'` y daba `owner` a un admin global
  // en un proyecto donde nunca tuvo fila de acceso. Un fallo de consulta
  // traduciéndose en más permisos, no en menos.
  const [acceso, perfiles] = await Promise.all([
    supabase.from('rr_hub_access').select('user_id, role_in_project').eq('project_id', project.id),
    supabase.from('rr_hub_profiles').select('id, email'),
  ]);

  const idDeEsta = ((perfiles.data ?? []) as { id: string; email: string }[]).find(
    (fila) => fila.email?.toLowerCase() === sesion.email.toLowerCase(),
  )?.id;
  const filaDeEsta = (acceso.data ?? []).find((fila) => fila.user_id === idDeEsta) as
    | { role_in_project: string }
    | undefined;
  const access = filaDeEsta ? { role_in_project: filaDeEsta.role_in_project } : null;

  if (access) return { project, access, supabase };

  // Global admins supervise every project even without an explicit access row.
  // El admin global es `owner` en todos los clientes. Se busca por correo: es la
  // misma fila y no depende de una sesión de Supabase para el id.
  const { data: profile } = await supabase
    .from('rr_hub_profiles')
    .select('global_role')
    .ilike('email', sesion.email)
    .maybeSingle();
  if (profile?.global_role === 'admin') return { project, access: { role_in_project: 'owner' }, supabase };

  return { project, access, supabase };
}

/**
 * El nombre de una persona del equipo, por id.
 *
 * Se usa para el responsable de una pieza (`rr_hub_ideas.created_by`). Devuelve
 * `null` y no un texto de reserva cuando no encuentra a nadie: la ficha tiene que
 * poder decir "sin responsable" en voz alta. Un nombre inventado es peor que un
 * hueco, porque nadie se da cuenta del hueco.
 */
export async function getProfileName(userId: string): Promise<{ full_name: string; email: string | null } | null> {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('rr_hub_profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return null;
  const nombre = (data.full_name as string) || (data.email as string) || null;
  if (!nombre) return null;
  return { full_name: nombre, email: (data.email as string) ?? null };
}

export async function getProjects() {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) {
    if (DEMO_MODE) return { projects: demoProjects.filter((project) => catalogoIncluye(project.slug)), supabase: null };
    // No `admin` role for a missing database. See requireSupabase().
    return { projects: [], supabase: null };
  }

  const sesion = await quienEs();

  // SIN SESION, LA PUERTA ESTA ABIERTA (2026-10-02).
  //
  // Antes esta línea devolvía la lista vacía sin cookie, y con ella la portada se
  // quedaba sin nada que enseñar. Era coherente con una puerta cerrada: sin
  // código no había clientes.
  //
  // Ahora los cuatro clientes se listan siempre. `rr_hub_projects` se lee por
  // service role, así que no depende de la RLS y no necesita que haya cookie.
  //
  // LO QUE NO SE ABRE: las escrituras. El guard de cada mutación sigue
  // comprobando `rr_hub_access`, que es lo que dice qué puede hacer una persona
  // concreta. Abrir la puerta no es abrir la escritura.
  if (!sesion) {
    const { data: todos } = await supabase
      .from('rr_hub_projects')
      .select('id, slug, name, client_name')
      .order('name', { ascending: true });
    return { projects: (todos ?? []).filter((p) => catalogoIncluye(p.slug)), supabase };
  }

  // Global admins supervisan every project even without an explicit access row.
  // Se busca por correo: es la misma fila, y el id ya no viene de una sesión
  // de Supabase.
  const { data: profile } = await supabase
    .from('rr_hub_profiles')
    .select('id, global_role')
    .ilike('email', sesion.email)
    .maybeSingle();
  if (profile?.global_role === 'admin') {
    const { data: allProjects } = await supabase
      .from('rr_hub_projects')
      .select('id, name, slug, client_name, brand_primary_color, description')
      .eq('slug', sesion.proyecto).order('name');
    return {
      projects: (allProjects ?? []).filter((project) => clienteEsVisible(project.slug, sesion.proyecto)).map((project) => ({ projects: project, role_in_project: 'owner' })),
      supabase,
    };
  }

  // Los proyectos de esa persona, por correo: `rr_hub_access` no tiene columna
  // de correo, se une con `rr_hub_profiles` a través del `user_id`.
  const { data: perfil } = await supabase
    .from('rr_hub_profiles')
    .select('id')
    .ilike('email', sesion.email)
    .maybeSingle();
  if (!perfil) return { projects: [], supabase };

  const { data } = await supabase
    .from('rr_hub_access')
    .select('role_in_project, projects:rr_hub_projects(id, name, slug, client_name, brand_primary_color, description)')
    .eq('user_id', perfil.id);

  return { projects: (data ?? []).filter((row: any) => clienteEsVisible(row.projects?.slug, sesion.proyecto)), supabase };
}

/**
 * Nombres de los responsables de un conjunto de ideas.
 *
 * MEDIDO 2026-10-05: el panel de bloqueos decía «C CLIENTE · 1 PIEZA O6» y
 * «35 ESPERANDO QUE EL EQUIPO LAS MUEVA», sin decir a quién. Con 21 personas con
 * acceso, un número no le dice a nadie qué hacer. Santiago pidió los nombres.
 *
 * `rr_hub_ideas.created_by` es un id de `rr_hub_profiles`; el nombre está en
 * `full_name`. Se resuelve en UNA consulta para todas las ideas y se devuelve un
 * `Map` id → nombre, con `null` cuando la pieza no tiene responsable. No se
 * inventa un nombre: la ficha tiene que poder decir "sin responsable" en voz
 * alta, porque un nombre inventado es peor que un hueco porque nadie se da
 * cuenta del hueco.
 */
export async function getResponsables(ideas: { id: string; created_by?: string | null }[]): Promise<Map<string, string | null>> {
  const vacio = new Map<string, string | null>();
  if (!ideas.length) return vacio;

  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return vacio;

  const ids = [...new Set(ideas.map((i) => i.created_by).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return vacio;

  const { data } = await supabase
    .from('rr_hub_profiles')
    .select('id, full_name')
    .in('id', ids);

  const porId = new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string) ?? null]));
  return new Map(ideas.map((i) => [i.id, porId.get(i.created_by ?? '') ?? null]));
}

export async function getIdeas(projectId: string) {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) {
    requireSupabase();
    // MEDIDO 2026-11-09: en modo ejemplo el tablero solo enseñaba las
    // fixtures, y las piezas creadas en la corrida local desaparecían al
    // recargar. Ahora el cuaderno local (`.data/demo/`) también cuenta.
    const guardadas = await ideasDemoGuardadas(projectId);
    return [...guardadas, ...demoIdeas];
  }

  const { data } = await supabase
    .from('rr_hub_ideas')
    .select('id, code, title, description, objective, content_type, category, origen, status, priority, created_at, updated_at, due_at, published_url, reference_urls, camera_brief, talent_brief, edit_brief, script_content, created_by, ad_id')
    .eq('project_id', projectId)
    // Las ideas archivadas desaparecen del tablero, pero NO se borran. Siguen en
    // la tabla con sus votos y sus comentarios, y se pueden volver a desarchivar.
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  return (await conPortadas(supabase, data ?? [])).map(mapIdea);
}

/**
 * Adjunta a cada idea su asset de portada.
 *
 * Se resuelve con la misma regla que la función `rr_hub_idea_cover`: primero
 * la elección guardada en `cover_asset_id`, y si no hay, el `reference_brief`
 * más reciente. Se hace en DOS consultas y no con un join anidado porque el join
 * de PostgREST solo alcanzaría la portada elegida, y la regla del "más reciente"
 * vive en la base, no en el nombre de la relación.
 *
 * Una sola consulta para todas las ideas del proyecto, no una por idea: con 26
 * piezas en el tablero, 26 consultas de portada a la vez.
 *
 * Si la consulta de portadas falla, las ideas se devuelven igual SIN portada y
 * la tarjeta cae al marco de marca. Un fallo aquí no puede dejar el tablero en
 * blanco.
 */
async function conPortadas(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  ideas: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (ideas.length === 0) return ideas;
  const ids = ideas.map((idea) => idea.id as string).filter(Boolean);
  if (ids.length === 0) return ideas;

  const elegidos = new Map<string, unknown>();
  {
    // ⚠️ Dos trampas en esta consulta, ambas medidas contra la base el
    // 2026-09-28 (proyecto ntgtvtzbjwotuwkiflar, anon key, idea real):
    //
    //  1. El embed se llama `cover_asset_id`, no `cover_asset`. PostgREST busca
    //     la relación con el NOMBRE de la columna; `cover_asset(...)` da
    //     400 PGRST200 ("Could not find a relationship between
    //     'rr_hub_ideas' and 'cover_asset'") aunque la llave foránea exista.
    //     El alias corto va con dos puntos: `cover_asset:cover_asset_id(...)`,
    //     y es lo que devuelve el nombre que lee el bucle de abajo.
    //
    //  2. supabase-js NO lanza: una consulta rota llega como `{data: null, error}`.
    //     Por eso esto no va en un `try/catch` — un `catch` aquí solo captura
    //     fallos de red y deja pasar el PGRST200 como si fuera "sin portadas".
    //     Se comprueba `error` y se registra, para que una relación que se rompa
    //     se vea en la consola en vez de convertirse en un tablero que
    //     "funciona" pintando siempre el arte de marca.
    const { data: conElegida, error } = await supabase
      .from('rr_hub_ideas')
      .select('id, cover_asset:cover_asset_id(id, file_name, mime_type, external_url)')
      .in('id', ids);
    if (error) {
      console.warn('[hub] no se pudieron leer las portadas elegidas:', error.message);
    }
    for (const fila of conElegida ?? []) {
      // ⚠️ Un embed a UNA columna se devuelve como OBJETO, no como array. La
      // forma de array es la de un embed a una relación que devuelve VARIAS
      // filas. Medido el 2026-09-28 contra la base con las 3 portadas puestas:
      // `cover_asset` llega como `{id, file_name, …}`, y el `?.[0]` de siempre
      // daba `undefined` → `null` → la tarjeta caía al arte de marca sin decir
      // nada, que es el mismo fallo silencioso que el del PGRST200.
      // Se aceptan las dos formas para no depender de eso.
      const bruto = fila.cover_asset as unknown;
      const asset = Array.isArray(bruto) ? (bruto[0] ?? null) : (bruto ?? null);
      if (asset) elegidos.set(fila.id as string, asset);
    }
  }

  const faltantes = ids.filter((id) => !elegidos.has(id));
  if (faltantes.length > 0) {
    {
      // Misma regla que arriba: `error` se comprueba, no se atrapa. Un fallo aquí
      // no es catastrofico (la tarjeta cae al arte de marca) pero tiene que verse.
      const { data: assets, error } = await supabase
        .from('rr_hub_assets')
        .select('id, idea_id, file_name, mime_type, external_url, created_at')
        .in('idea_id', faltantes)
        .eq('asset_stage', 'reference_brief')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[hub] no se pudieron leer los briefs de portada:', error.message);
      }
      // La ordenación es global, así que el primero que aparece de cada idea es
      // el suyo más reciente. `seen` evita que un segundo brief la sobreescriba.
      const vistos = new Set<string>();
      for (const fila of assets ?? []) {
        const ideaId = fila.idea_id as string;
        if (vistos.has(ideaId)) continue;
        vistos.add(ideaId);
        elegidos.set(ideaId, {
          id: fila.id,
          file_name: fila.file_name,
          mime_type: fila.mime_type,
          external_url: fila.external_url,
        });
      }
    }
  }

  return ideas.map((idea) => ({
    ...idea,
    cover_asset: elegidos.get(idea.id as string) ?? null,
  }));
}

export async function getIdea(projectId: string, id: string) {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) {
    requireSupabase();
    const guardada = await ideaDemoGuardada(id);
    return guardada ?? getDemoIdea(id);
  }

  const { data } = await supabase
    .from('rr_hub_ideas')
    // El `cover_asset` NO viene en el `*`: es una relación por la columna
    // `cover_asset_id` y PostgREST solo la resuelve si se nombra. Con `select('*')`
    // la idea llegaba con `cover_asset` en `undefined`, y la ficha pintaba el
    // placeholder aunque la portada estuviera subida y correcta en la base.
    // Por eso "le puse portada y no sale": la portada estaba, la ficha no la
    // miraba. El alias va con dos puntos (`cover_asset:cover_asset_id(...)`).
    .select('*, cover_asset:cover_asset_id(id, file_name, mime_type, external_url)')
    .eq('project_id', projectId)
    .eq('id', id)
    .maybeSingle();

  return data ? mapIdea(data) : null;
}

/**
 * Conteo de votos de una idea, para pintar el contador en la ficha.
 *
 * Solo el NÚMERO, nunca el token de quien votó: el votante es anónimo por
 * diseño, y devolverlo en la página convertiría el voto en un dato personal
 * legible por cualquiera que tenga el enlace. El token del navegador se manda
 * él mismo al votar y el servidor lo usa para el upsert.
 *
 * Se lee siempre, incluso con cero votos: `rr_hub_votes` no tiene filas para una
 * idea recién abierta, y ese `0 a favor / 0 en contra` es exactamente lo que hay
 * que mostrar.
 */
export type ConteoVotos = {
  aFavor: number;
  enContra: number;
  total: number;
  /**
   * La respuesta de cada persona, para pintar un emoji por persona.
   *
   * Sin esto la ficha abre con "3 a favor" y no hay forma de saber si son tres
   * pulgares o tres cambios pedidos. Santiago, 2026-09-29.
   */
  detalle: DecisionVoto[];
};

export async function getVotos(ideaId: string): Promise<ConteoVotos> {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return { aFavor: 0, enContra: 0, total: 0, detalle: [] };

  const { data } = await supabase
    .from('rr_hub_votes')
    .select('decision')
    .eq('idea_id', ideaId);

  const votos = data ?? [];
  const aFavor = votos.filter((v) => v.decision === 'yes').length;
  const enContra = votos.filter((v) => v.decision === 'no').length;
  return { aFavor, enContra, total: votos.length, detalle: votos.map((v) => v.decision as DecisionVoto) };
}

/**
 * La miniatura del anuncio de una idea, si la tiene.
 *
 * MEDIDO 2026-10-01: Facebook no sirve la biblioteca de anuncios embebida
 * (marco vacío, comprobado en el navegador) y exige sesión para abrir el
 * anuncio, así que la app no puede capturar la imagen al vuelo. Lo único
 * honesto es la miniatura GUARDADA en `rr_hub_ad_library.cover_url`.
 *
 * Se busca por `ad_id` —la relación real— y no por la URL: dos ideas pueden
 * apuntar al mismo anuncio, y la URL se puede haber pegado a mano sin quedar
 * ligada. Con la relación, la ficha sabe de qué anuncio es.
 *
 * Devuelve `null` cuando no hay anuncio o no tiene miniatura. No inventa un
 * placeholder con el logo de RR: una imagen que no es el anuncio es peor que
 * un aviso honesto.
 */
export async function getCoverDelAnuncio(adId: string | null | undefined): Promise<string | null> {
  if (!adId) return null;
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('rr_hub_ad_library')
    .select('cover_url')
    .eq('id', adId)
    .maybeSingle();
  const url = (data?.cover_url as string | null) ?? null;
  return url && url.trim() ? url.trim() : null;
}

/**
 * El conteo de votos de TODAS las ideas de golpe.
 *
 * MEDIDO 2026-10-01: con el botón de voto en la tarjeta del tablero (PR de
 * votación), pedir el conteo idea por idea serían 19 consultas en cada carga de
 * la página. Eso no es "un poco más lento": es la diferencia entre una pantalla
 * que carga y una que se arrastra, y en móvil se nota.
 *
 * Por eso es UNA consulta agrupada por `idea_id`, no N. La vista `rr_hub_board`
 * ya calcula `days_in_stage` y `last_event_at` y la app no la mira, así que
 * esta se hace aquí a propósito y en una sola pasada.
 *
 * Devuelve un mapa vacío si algo falla, nolanza: que el tablero pinte los
 * botones en cero es mejor que no pintar el tablero. El servidor es la
 * autoridad cuando puede; cuando no, la pantalla no se cae.
 */
export async function getVotosDeVarias(
  ideaIds: readonly string[],
): Promise<Record<string, { aFavor: number; enContra: number }>> {
  const conteo: Record<string, { aFavor: number; enContra: number }> = {};
  if (!ideaIds.length) return conteo;

  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return conteo;

  const { data } = await supabase
    .from('rr_hub_votes')
    .select('idea_id, decision')
    .in('idea_id', [...ideaIds]);

  for (const id of ideaIds) conteo[id] = { aFavor: 0, enContra: 0 };
  for (const voto of data ?? []) {
    const fila = conteo[voto.idea_id as string];
    if (!fila) continue;
    if (voto.decision === 'yes') fila.aFavor += 1;
    else if (voto.decision === 'no') fila.enContra += 1;
  }
  return conteo;
}

/**
 * MEDIDO 2026-10-03: cuántos votos pidieron un cambio, por proyecto.
 *
 * `getVotosDeVarias` solo mira `yes` y `no`, así que una idea con un "cambiar
 * esto" salía con el MISMO conteo que una que nadie ha tocado. El decision
 * `change` existe en la base (MEDIDO: 1 voto) y es el único que frena una
 * pieza, pero ningún lector lo contaba. Se agrega su conteo aparte; la
 * función de las gráficas lo usa para la barra de fricción.
 */
export async function getVotosDeCambio(projectId: string): Promise<number> {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return 0;
  // MEDIDO 2026-10-03: `rr_hub_votes` NO tiene columna `project_id`. Solo tiene
  // `idea_id`, así que el proyecto se resuelve cruzando por la idea. Filtrar por
  // `project_id` devolvía error y la función respondía 0 siempre.
  const { data: ideas } = await supabase
    .from('rr_hub_ideas')
    .select('id')
    .eq('project_id', projectId);
  const ids = (ideas ?? []).map((i) => i.id as string);
  if (!ids.length) return 0;

  const { data, error } = await supabase
    .from('rr_hub_votes')
    .select('id')
    .eq('decision', 'change')
    .in('idea_id', ids);
  if (error) return 0;
  return data?.length ?? 0;
}

/**
 * El equipo y su último latido, para pintar quién está en línea.
 *
 * Solo devuelve filas que existen en `rr_hub_presencia`: quien nunca ha
 * entrado no aparece. El panel lo traduce a "DESCONECTADO · nunca ha entrado",
 * que es el estado que Dirección pidió distinguir del "activo pero no aquí".
 */
export type PresenciaFila = { email: string; nombre: string | null; lastSeenAt: string | null };

export async function getPresencia(): Promise<PresenciaFila[]> {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from('rr_hub_presencia')
    .select('email, profile_id, last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(50);

  const filas = data ?? [];
  if (!filas.length) return [];

  const ids = filas.map((f) => f.profile_id).filter((id): id is string => Boolean(id));
  const { data: perfiles } = ids.length
    ? await supabase.from('rr_hub_profiles').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string | null }[] };

  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));

  return filas.map((f) => ({
    email: f.email as string,
    nombre: (f.profile_id ? nombrePorId.get(f.profile_id) : null) ?? null,
    lastSeenAt: (f.last_seen_at as string | null) ?? null,
  }));
}

/**
 * Public audit reads. These use the same anonymous client; RLS turns every
 * read below into an anon-only, read-only view while the global audit switch
 * is open, so nothing leaks and nothing can be written.
 */
export async function getAuditSettings() {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return { enabled: false, opens_at: null, expires_at: null, updated_at: null };
  const { data } = await supabase
    .from('rr_hub_audit_settings')
    .select('enabled, opens_at, expires_at, updated_at')
    .eq('id', true)
    .maybeSingle();
  return data ?? { enabled: false, opens_at: null, expires_at: null, updated_at: null };
}

/** Every project, for the global audit index. RLS gates this, not a column filter. */
export async function getAuditProjects() {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) { requireSupabase(); return []; }
  const { data } = await supabase
    .from('rr_hub_projects')
    .select('id, name, slug, client_name, description, brand_primary_color')
    .order('name');
  const sesion = await quienEs();
  return (data ?? []).filter((project) => clienteEsVisible(project.slug, sesion?.proyecto));
}

/** Read-only administrative surface: roster, access matrix and pending invites. */
export async function getAuditRoster() {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return { profiles: [], access: [], invites: [] };
  const [profiles, access, invites] = await Promise.all([
    supabase.from('rr_hub_profiles').select('id, email, full_name, global_role, created_at').order('email'),
    supabase.from('rr_hub_access').select('user_id, project_id, role_in_project, granted_at'),
    supabase.from('rr_hub_invites').select('email, project_id, role_in_project').order('email'),
  ]);
  return { profiles: profiles.data ?? [], access: access.data ?? [], invites: invites.data ?? [] };
}

export async function getAuditProject(slug: string) {
  if (!(await clienteExiste(slug))) return null;

  // SIN PUERTA (2026-10-02): sin sesión se ve la auditoría de cualquier cliente.
  //
  // Antes exigía que el slug fuera el del código con el que se entró, y sin cookie
  // devolvía null. Con la puerta abierta eso convertía `/audit/boga` en un 404
  // para quien llega sin sesión, y `/audit` (que redirige al primero) en un 404
  // detrás de un 307: dos saltos para acabar en nada.
  //
  // Esto no abre nada que antes no se pudiera ver: la auditoría es de SOLO LECTURA y
  // su propia cabecera lo dice. Lo que sigue igual es el filtro para quien tiene
  // sesión, porque su fila de acceso es la que dice a qué clientes pertenece.
  const sesion = await quienEs();
  if (sesion && !clienteEsVisible(slug, sesion.proyecto)) return null;
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) {
    requireSupabase();
    // MEDIDO 2026-11-09: sin base, la auditoría devolvía `null` y la página
    // era un 404 — «auditado» era una palabra vacía. En modo ejemplo se
    // devuelve el cliente del ejemplo y la auditoría se recorre de verdad.
    if (DEMO_MODE) {
      const demo = getDemoProject(slug);
      return demo ? { ...demo, public_audit: true } : null;
    }
    return null;
  }
  const { data } = await supabase
    .from('rr_hub_projects')
    .select('id, name, slug, client_name, description, brand_primary_color, public_audit')
    .eq('slug', slug)
    .maybeSingle();
  return data ?? null;
}

export async function getAuditIdeas(projectId: string) {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) { requireSupabase(); return demoIdeas; }
  const { data } = await supabase
    .from('rr_hub_ideas')
    .select('id, code, title, description, objective, content_type, category, origen, status, priority, created_at, updated_at, reference_urls, camera_brief, talent_brief, edit_brief, script_content')
    .eq('project_id', projectId)
    .order('code', { ascending: true });
  return (data ?? []).map(mapIdea);
}

export async function getAuditIdea(projectId: string, id: string) {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) {
    requireSupabase();
    // También lo que se creó en la corrida local, para que la auditoría vea lo
    // mismo que el tablero.
    const guardada = await ideaDemoGuardada(id);
    return guardada ?? getDemoIdea(id);
  }
  const { data } = await supabase
    .from('rr_hub_ideas')
    .select('*')
    .eq('project_id', projectId)
    .eq('id', id)
    .maybeSingle();
  return data ? mapIdea(data) : null;
}

/** Counts per status for the audit summary, computed server-side. */
export async function getAuditStats(projectId: string) {
  const ideas = await getAuditIdeas(projectId);
  const counts: Record<string, number> = {};
  for (const idea of ideas) counts[idea.status] = (counts[idea.status] ?? 0) + 1;
  return { total: ideas.length, counts };
}

export async function getAuditTimeline(ideaId: string) {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('rr_hub_events')
    .select('id, to_status, comment, actor_label, created_at')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: false });
  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    status: row.to_status as string,
    actor: (row.actor_label as string) || 'RR ALIADOS',
    note: (row.comment as string) ?? '',
    createdAt: row.created_at as string,
  }));
}

export async function getAuditComments(ideaId: string) {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('rr_hub_comments')
    .select('id, body, role_label, author_label, resolved_at, created_at')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: true });
  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    author: (row.author_label as string) || 'RR ALIADOS',
    role: row.role_label as string,
    body: row.body as string,
    resolved: Boolean(row.resolved_at),
    createdAt: row.created_at as string,
  }));
}

export async function getAuditAssets(ideaId: string) {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('rr_hub_assets')
    .select('id, file_name, asset_stage, version_label, created_at, external_url')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: true });
  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    name: row.file_name as string,
    stage: row.asset_stage as string,
    version: (row.version_label as string) ?? 'v1',
    createdAt: row.created_at as string,
  }));
}

/**
 * Comentarios, archivos y línea de tiempo de una pieza.
 *
 * Antes los leía el navegador con la clave anónima. Con la puerta por código el
 * anon no tiene permiso de lectura sobre esas tablas, así que llegaban vacíos y
 * la ficha parecía una pieza sin comentarios ni historial. No había error
 * visible: una lista vacía y una lista que no se cargó se ven igual.
 *
 * Ahora se leen aquí, con la clave del servidor, y llegan como props. La cookie
 * ya checked en la página: quien no entra no llega a este punto.
 */
export async function getComentarios(ideaId: string) {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) {
    // MEDIDO 2026-11-09: en modo ejemplo el hilo salía siempre vacío, así que
    // `ENVIAR COMENTARIO` no tenía nada que mostrar y parecía roto. Ahora los
    // comentarios del cuaderno local se leen igual que los de la base.
    if (DEMO_MODE) {
      const guardados = await comentariosDemo(ideaId);
      return guardados.map((c) => ({
        id: c.id,
        text: c.body,
        author: c.author_label,
        role: 'colaboracion',
        createdAt: c.created_at,
        resolved: Boolean(c.resolved_at),
      }));
    }
    return [];
  }
  const { data } = await supabase
    .from('rr_hub_comments')
    .select('id, body, author_label, resolved_at, created_at')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: true })
    .limit(100);
  // Se devuelve con la forma que el componente ya espera (`text`, `author`,
  // `createdAt`), no con los nombres de columna. Que el mapeo esté aquí y no
  // en el componente es lo que evita tener dos versiones de la misma cosa: si
  // el componente se cambia, el servidor sigue hablando su idioma.
  return (data ?? []).map((c) => ({
    id: c.id as string,
    text: (c.body as string) ?? '',
    author: (c.author_label as string) ?? 'RR ALIADOS',
    role: 'colaboracion',
    createdAt: (c.created_at as string) ?? '',
    resolved: Boolean(c.resolved_at),
  }));
}

export async function getAssets(ideaId: string) {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('rr_hub_assets')
    .select('id, asset_stage, storage_path, external_url, file_name, mime_type, version_label, created_at')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: true })
    .limit(100);
  return (data ?? []).map((f) => ({
    id: f.id as string,
    name: (f.file_name as string) || 'archivo',
    kind: (f.mime_type as string) || 'archivo',
    stage: f.asset_stage as string,
    version: (f.version_label as string) || 'v1',
    createdAt: (f.created_at as string) || '',
    // `external_url` PRIMERO, `storage_path` de reserva.
    //
    // El orden estaba invertido y por eso la ficha no mostraba ninguna imagen:
    // `storage_path` es la ruta DENTRO del bucket (`candilejas/<id>/...`), no
    // una dirección. Al devolverla en `url`, un `<img src>` la pedía como si
    // fuera una URL relativa y no cargaba nada — 200 OK, marco vacío, sin error
    // en consola. `external_url` es la que sí abre el CDN.
    url: (f.external_url as string) || (f.storage_path as string) || null,
  }));
}

export async function getTimeline(ideaId: string) {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('rr_hub_events')
    .select('id, from_status, to_status, comment, actor_label, created_at')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: true })
    .limit(100);
  return (data ?? []).map((e) => ({
    id: e.id as string,
    status: (e.to_status as string) ?? '',
    from: (e.from_status as string) ?? null,
    actor: (e.actor_label as string) ?? 'Sistema',
    note: (e.comment as string) ?? '',
    createdAt: (e.created_at as string) ?? '',
  }));
}

/**
 * A qué clientes tiene acceso la persona que entró, y a cuáles no.
 *
 * Para el selector de clientes. La respuesta tiene las dos mitades a propósito:
 * Santiago pidió (2026-09-29) que se vieran **los dos** clientes, con candado en
 * el que no se puede entrar. Mostrar solo los que puede abrir esconde que existe
 * otro cliente; mostrar los dos sin decir nada invita a pulsar donde no se puede.
 *
 * La regla de qué se puede abrir NO está aquí: el servidor la vuelve a
 * comprobar en `/api/cambiar-cliente` contra `rr_hub_access` antes de emitir la
 * cookie nueva. Esto es la lista para pintar; la decisión, la ruta.
 *
 * El admin global entra en todos los clientes, con o sin fila de acceso: es lo
 * que ya hacía el resto del hub y lo que espera quien administra. El resto solo
 * ve los que tiene en `rr_hub_access`.
 */
export async function getClientesDeLaPersona(): Promise<{
  // MEDIDO 2026-10-03: el tipo declarado se olvidaba de `id`, que SÍ viene en la
  // fila. La portada nueva lo necesita para pedir el conteo de piezas de cada
  // cliente sin una consulta extra por cliente. El tipo mentía sobre el dato: por
  // eso `getIdeas(cliente.id)` no compilaba aunque el objeto fuera correcto.
  abiertos: { id: string; slug: string; name: string; client_name: string; brand_primary_color: string | null; description: string | null; rol: string }[];
  cerrados: { slug: string; name: string; client_name: string; brand_primary_color: string | null; description: string | null; motivo: 'sin-fila' | 'sin-codigo' }[];
  actual: string | null;
}> {
  if (DEMO_MODE) {
    return {
      abiertos: demoProjects.filter((project) => catalogoIncluye(project.slug)).map((project) => ({ ...project, rol: 'owner' })),
      cerrados: [],
      actual: 'wundeer',
    };
  }

  const vacio = { abiertos: [], cerrados: [], actual: null as string | null };
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) return vacio;

  // SIN PUERTA (2026-10-02): sin sesión se listan TODOS los clientes, no ninguno.
  //
  // Antes: `if (!sesion) return vacio`. Con la puerta cerrada era correcto (sin
  // código no se veía nada). Con la puerta abierta, la portada hacía
  // `abiertos.length === 0` y pintaba "Todavía no hay clientes" para todo el
  // mundo, aunque los cuatro estén dados de alta. Un 404 de contenido: la página
  // responde 200 y dice que no hay nada.
  //
  // La fila de la persona (`rr_hub_profiles`) solo se necesita para saber el rol
  // de cada cliente, y eso ya se calcula abajo con `sesion?.email`. Si no hay
  // sesión no hay rol, y sin rol todos los clientes salen como solo lectura:
  // exactamente lo que se decidió el 2026-10-02.
  const sesion = await quienEs();
  let perfilId: string | null = null;
  let globalRole: string | null = null;
  if (sesion) {
    const { data: perfil } = await supabase
      .from('rr_hub_profiles')
      .select('id, global_role')
      .ilike('email', sesion.email)
      .maybeSingle();
    perfilId = perfil?.id ?? null;
    globalRole = perfil?.global_role ?? null;
  }
  if (sesion && !globalRole) return vacio;

  // Las dos consultas van en paralelo y el cruce de `access` con `proyectos` se
  // hace por `project_id`, que es una columna real de las dos. Nada de embed
  // aquí: `rr_hub_access` no tiene FK con `rr_hub_profiles` (verificado en
  // `pg_constraint`), y ese embed devolvía PGRST200 con `data: null` sin lanzar.
  const [catalogo, accesos] = await Promise.all([
    supabase
      .from('rr_hub_projects')
      .select('id, slug, name, client_name, brand_primary_color, description')
      .order('name'),
    // Sin sesión no hay `perfilId`: la consulta se hace igual y no devuelve
    // filas, que es lo correcto. `.eq()` con `null` se_skip en vez de reventar.
    supabase.from('rr_hub_access').select('project_id, role_in_project').eq('user_id', perfilId ?? '__sin_sesion__'),
  ]);

  // MEDIDO 2026-10-04. Santiago: «solo quiero que dejes a wundeer y candilejas».
  //
  // BOGA y Satiro salían como tarjetas con 0 piezas y sin código de entrada: se
  // veían, se pulsaban y no abrían nada. Un cliente que no se puede abrir no es
  // una opción, es un error de pantalla.
  //
  // NO se borran. Se apartan del CATÁLOGO VISIBLE, que es distinto de borrarlos:
  // las ideas, los anuncios y la trazabilidad siguen intactos, y volver a
  // exponerlos es vaciar la variable. Borrar filas de producción para tapar un
  // cartel molesto sería cambiar datos para tapar una pantalla.
  //
  // La lista se lee del entorno y no se escribe en el código, para que exponer
  // uno nuevo sea cambiar una variable y no editar un array. Antes existía
  // `CLIENTES_CONOCIDOS = ['wundeer', 'candilejas']` a mano, y por eso Boga y
  // Satiro salían con candado: había que abrir el fichero para poder verlos.
  //
  const todosLosProyectos = (catalogo.data ?? []) as {
    id: string; slug: string; name: string; client_name: string;
    brand_primary_color: string | null; description: string | null;
  }[];
  const proyectos = todosLosProyectos.filter((p) => catalogoIncluye(p.slug));

  if (proyectos.length === 0) return vacio;

  const rolPorProyecto = new Map<string, string>();
  for (const fila of (accesos.data ?? []) as { project_id: string; role_in_project: string }[]) {
    rolPorProyecto.set(fila.project_id, fila.role_in_project);
  }

  // SIN PUERTA (2026-10-02): la lista corta que recortaba esto ya no existe.
  //
  // Antes era `CLIENTES_CONOCIDOS = ['wundeer', 'candilejas']`, escrita a mano, y
  // BOGA y Satiro salían con candado porque no estaban en ella: había que añadir
  // el nombre al código para poder abrirlos. Una lista de clientes a mano es una
  // promesa de que no se va a actualizar, y ya había fallado una vez.
  //
  // Ahora manda lo que hay: `proyectos` es el catálogo entero de la base. Lo que
  // sigue decidiendo si un cliente se abre o no es `rr_hub_access`, una fila por
  // persona, que es donde debe estar esa decisión.
  const conocidos = proyectos;

  // SIN PUERTA (2026-10-02): sin sesión, TODOS los clientes salen abiertos.
  //
  // MEDIDO en producción con el merge ya desplegado: la raíz devolvía
  // "Todavía no tienes un cliente abierto" con los cuatro clientes dados de
  // alta. La causa es esta línea: `rolPorProyecto` se llena de
  // `rr_hub_access`, y sin cookie no hay filas, así que el filtro dejaba la
  // lista vacía y los cuatro clientes caían a `cerrados`.
  //
  // La puerta también decidía el CATÁLOGO, no solo si se entraba. Eso ya no es
  // lo que se decidió el 2026-10-02: se entra directo, sin fila de acceso, y
  // quien no tenga fila abre igual en solo lectura. El rol sale de la fila si la
  // hay; si no la hay, es `client_viewer`, el mismo rol que usan los visitantes
  // en el resto del hub. Ver un cliente no es escribir en él: eso lo decide
  // `rr_hub_access` en el guard, que sigue igual.
  //
  // MEDIDO 2026-10-04. El valor por defecto era `client_viewer`, de cuando entrar
  // era con un código y no entrar significaba no poder escribir. Con el modelo
  // nuevo («100% libre», Santiago) ese valor mentía: el servidor ya da `owner` a
  // todo el que llega, y la portada seguía announcing LECTURA.
  //
  // Lo que se conserva: si la persona TIENE fila en `rr_hub_access`, su rol de
  // ahí manda y se muestra. Lo que se quita es el default de solo lectura, que ya
  // no describe lo que pasa.
  const abiertos = conocidos.map((p) => ({ ...p, rol: rolPorProyecto.get(p.id) ?? 'owner' }));

  // Los cerrados salen del catálogo ENTERO, no de `conocidos`. Con la lista
  // corta como fuente, Satiro y Boga no aparecían nunca: un `filter` sobre
  // `conocidos` solo puede devolver cosas que ya estaban en `conocidos`.
  //
  // Eso vaciaba el candado justo en el caso para el que existe. Santiago lo
  // pidió así el 2026-09-29: que se vea qué clientes hay, aunque no se puedan
  // abrir. Con la lista corta, quien no tenía fila en Candilejas veía un
  // desplegable con un solo cliente y sin ninguna pista de que hubiera más.
  //
  // Para abrir hace falta las dos cosas: fila en `rr_hub_access` Y cliente
  // conocido. Por eso la puerta (`/api/cambiar-cliente`) valida `CLIENTES_CONOCIDOS`
  // aunque esta función muestre Satiro y Boga: se ven, pero no se abren.
  const slugsAbiertos = new Set(abiertos.map((p) => p.slug));
  const cerrados = proyectos
    .filter((p) => !slugsAbiertos.has(p.slug))
    .map(({ id: _id, ...resto }) => ({
      ...resto,
      // Por qué está cerrado este cliente, que no es lo mismo siempre:
      //   - sin-fila   → tu correo no tiene fila de acceso. Pídeselo.
      //   - sin-codigo → tienes fila, pero el cliente no tiene código de
      //                  cuatro dígitos, así que no hay puerta por la que entrar.
      //
      // Medido el 2026-09-29: con el motivo único, una creativa con filas en
      // Wundeer y Candilejas veía "tu correo no tiene acceso" sobre Boga y
      // Satiro, que era verdad para ella, pero el mismo texto ocultaba que
      // esos clientes existen con equipo propio. El motivo lo hace exacto.
      motivo: (rolPorProyecto.has(_id) ? 'sin-codigo' : 'sin-fila') as 'sin-codigo' | 'sin-fila',
    }));

  return { abiertos, cerrados, actual: sesion?.proyecto ?? null };
}

/**
 * Las personas que pueden votar, del servidor.
 *
 * MEDIDO 2026-10-03. El selector de perfil necesita la lista del equipo, y no
 * puede sacarse de `rr_hub_presencia`: esa tabla dice quién se ha conectado
 * lately, no quién tiene derecho a voto. Con la puerta por código, quien entra al
 * tablero puede ser alguien del equipo que nunca ha entrado, y su nombre
 * desaparecería del selector. MEDIDO en producción: `rr_hub_profiles` tiene 18
 * personas con `is_team_member` e `is_active`.
 *
 * Solo se devuelven activas: una fila desactivada no puede votar —el servidor lo
 * rechaza con 403—, y ofrecerla en el selector sería prometer algo que no pasa.
 */
export async function getEquipoVotante(): Promise<{ email: string; nombre: string }[]> {
  const supabase = await createServiceClient() ?? await createClient();
  if (!supabase) {
    // MEDIDO 2026-11-09: sin base, el equipo salía vacío y el hilo de
    // comentarios quedaba bloqueado («Elige con qué perfil del equipo
    // comentas») sin que hubiera ningún perfil que elegir. En modo ejemplo
    // salen las personas de ejemplo, y el botón de comentar funciona.
    if (DEMO_MODE) return demoEquipo;
    return [];
  }

  const { data } = await supabase
    .from('rr_hub_profiles')
    .select('email, full_name')
    .eq('is_team_member', true)
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  return (data ?? [])
    .map((f) => ({
      email: (f.email as string) ?? '',
      // MEDIDO: `full_name` es la columna real. `nombre` no existe en la tabla y
      // pedirla devolvía `{}` sin error, que se pintaba como una lista de
      // nombres en blanco.
      nombre: (f.full_name as string | null) ?? (f.email as string) ?? '',
    }))
    .filter((p) => p.email !== '');
}
