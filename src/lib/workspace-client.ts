'use client';

import { ROLE_LABEL, allowedTransitions, type RoleKey, type WorkflowStatus, type DecisionVoto } from '@/lib/flow';
import { perfilElegido } from '@/lib/perfil-votante';

/**
 * Client-side workspace operations backed by Supabase.
 *
 * Every write goes to the `rr_hub_*` tables (never the legacy CRM tables) and
 * relies on RLS for authorization. When Supabase env vars are absent these
 * helpers report that state so the UI can explain itself instead of pretending
 * to persist anything.
 */

export type AssetStage =
  | 'reference_brief'
  | 'script'
  | 'raw'
  | 'edit_v1'
  | 'edit_v2'
  | 'edit_final'
  | 'publication_evidence';

export const STORAGE_BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'rr-content-assets';

export type TimelineEvent = {
  id: string;
  status: string;
  /**
   * Estado de partida. Cuando es igual a `status`, el evento NO es una
   * transición: es un cambio de metadata (asignar un responsable). La línea de
   * tiempo lo muestra aparte para que nadie lea "[BORRADOR] → [BORRADOR]" como
   * una pieza que retrocedió y volvió.
   */
  fromStatus?: string | null;
  actor: string;
  note: string;
  createdAt: string;
};

export type IdeaComment = {
  id: string;
  author: string;
  role: string;
  text: string;
  createdAt: string;
  resolved: boolean;
};

export type IdeaAsset = {
  id: string;
  name: string;
  kind: string;
  stage: string;
  version: string;
  createdAt: string;
  url: string | null;
};

const stamp = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Ahora';
export async function transitionIdeaStatus(input: {
  ideaId: string;
  fromStatus?: string;
  toStatus: string;
  note: string;
  role: RoleKey;
}): Promise<{ error?: string }> {
  // The check below is for the UI only: it greys out buttons the person cannot
  // use, so they get an explanation instead of a silent failure. It is NOT a
  // security control. The real one runs on the server, in
  // api/workspace/transition, which reads the caller's real role from
  // rr_hub_access and ignores the status posted from here.
  //
  // The previous version of this comment claimed a hand-crafted request could
  // not skip states. It could: the write went straight to Supabase with the
  // anon key, so this function was the only thing between the request and the
  // table, and the requester did not have to run it.
  const from = (input.fromStatus ?? 'draft') as WorkflowStatus;
  const to = input.toStatus as WorkflowStatus;
  const permitted = allowedTransitions(input.role, from).some((move) => move.to === to);
  if (!permitted) {
    return { error: `Tu rol (${ROLE_LABEL[input.role]}) no puede pasar de ${from} a ${to}.` };
  }

  // MEDIDO 2026-10-04: el cuerpo viaja el perfil con el que se actúa. El cliente
  // de Wundeer no tiene sesión de Google — elige su perfil en el selector y solo
  // existe en `localStorage` — y sin esto el servidor no tenía con quién
  // resolver el rol y la pieza llegaba con «SIN ACCIÓN DISPONIBLE». Se manda como
  // `actorProfile`, igual que el voto y el comentario, y el servidor lo contrasta
  // contra `rr_hub_profiles` + `rr_hub_access`: si la fila no existe, no concede
  // nada. No es un permiso que seose por el cuerpo.
  const perfil = perfilElegido();
  const response = await postWorkspaceAction('transition', {
    ideaId: input.ideaId, toStatus: to, fromStatus: from, note: input.note,
    ...(perfil ? { actorProfile: perfil.email } : {}),
  });
  return response ?? {};
}

/** El perfil elegido viaja en TODA acción (antes solo en `transition`). */
function conPerfil(body: Record<string, unknown>): Record<string, unknown> {
  if (body.actorProfile) return body;
  const perfil = perfilElegido();
  return perfil ? { ...body, actorProfile: perfil.email } : body;
}

/**
 * Envía una acción al servidor y devuelve su cuerpo.
 *
 * Antes devolvía `null` en éxito y solo propagaba `error`, lo cual servía para
 * las mutaciones ("ok o ya qué más da") pero no para las lecturas: `roster`
 * necesita el contenido de la respuesta, no un centinela. Ahora se devuelve el
 * JSON parseado, y `error` se queda como campo para que los dos casos convivan.
 */
export async function postWorkspaceAction(
  action: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {

  // La cookie de la puerta viaja sola: es la misma del navegador y no hace
  // falta ponerla a mano en una cabecera. Antes iba aquí un token de sesión de
  // Supabase; con la puerta por código ya no hay token que mandar, y el
  // `credentials` explícito evita que el navegador la omita.
  const response = await fetch(`/api/workspace/${action}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(conPerfil(body)),
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    return { error: (payload?.error as string) ?? `La operación falló (${response.status}).` };
  }
  return payload;
}
export async function addComment(input: {
  ideaId: string;
  body: string;
  roleLabel: string;
  /**
   * El perfil con el que se comenta. MEDIDO 2026-10-03: sin esto el comentario
   * exigía sesión y respondía «Entra con el código de tu cliente». Va en
   * `authorProfile`, no en un campo de autor libre: el servidor lo comprueba
   * contra `rr_hub_profiles` y usa el nombre real de esa fila.
   */
  authorProfile?: string;
}): Promise<{ error?: string }> {
  // `roleLabel` used to be written straight into the row, so the browser chose
  // how a comment was attributed — anyone could post as "Owner". The server
  // ignores it and uses the caller's real role from rr_hub_access.
  //
  // MEDIDO 2026-10-03: lo mismo con el nombre. Antes `author_label` salía del
  // correo de la SESIÓN; ahora sale del perfil comprobado en la base.
  const response = await postWorkspaceAction('comment', {
    ideaId: input.ideaId,
    body: input.body,
    ...(input.authorProfile ? { authorProfile: input.authorProfile } : {}),
  });
  return response ?? {};
}

export async function resolveComment(input: { commentId: string; ideaId: string; resolved: boolean }): Promise<{ error?: string }> {
  const response = await postWorkspaceAction('resolve-comment', {
    commentId: input.commentId, ideaId: input.ideaId, resolved: input.resolved,
  });
  return response ?? {};
}

/**
 * Los campos que `update` acepta. Se repiten aquí a propósito: el cliente
 * declara qué manda y el servidor decide qué escribe, y los dos lados tienen que
 * poder discrepar sin romperse. Si el servidor acepta algo que esta lista no
 * tiene, es una decisión suya y no un error del formulario.
 */
export type EditableIdea = {
  title?: string;
  description?: string;
  objective?: string;
  cameraBrief?: string;
  talentBrief?: string;
  editBrief?: string;
  referenceUrls?: string[];
  /**
   * MEDIDO 2026-10-01: la fecha de salida y el enlace de publicación son
   * columnas que existen en `rr_hub_ideas` y funcionan, pero no había forma de
   * escribirlas desde el Hub. La pantalla de publicaciones lo atribuía a una
   * migración que ya estaba aplicada. `null` es legítimo: es cómo se borra.
   */
  dueAt?: string | null;
  publishedUrl?: string | null;
  metrics?: { alcance?: number | null; interacciones?: number | null; conversiones?: number | null; nota?: string | null };
};

/**
 * Guarda cambios de una pieza existente.
 *
 * Antes no había forma de corregir una idea: se creaba y ya. Una pieza sin
 * referencia se quedaba sin referencia para siempre, y había 6 de 26 así, dos
 * de ellas a punto de publicarse.
 *
 * Solo se manda lo que cambió. Mandar el objeto entero borraría los campos que
 * vinieran vacíos.
 */
export async function updateIdea(
  ideaId: string,
  cambios: EditableIdea,
): Promise<{ error?: string; actualizado?: string[] }> {
  const cuerpo: Record<string, unknown> = { ideaId };

  if (cambios.title !== undefined) cuerpo.title = cambios.title;
  if (cambios.description !== undefined) cuerpo.description = cambios.description;
  if (cambios.objective !== undefined) cuerpo.objective = cambios.objective;
  if (cambios.cameraBrief !== undefined) cuerpo.camera_brief = cambios.cameraBrief;
  if (cambios.talentBrief !== undefined) cuerpo.talent_brief = cambios.talentBrief;
  if (cambios.editBrief !== undefined) cuerpo.edit_brief = cambios.editBrief;
  // Array vacío es legítimo: es como se quita una referencia que ya no sirve.
  if (cambios.referenceUrls !== undefined) cuerpo.referenceUrls = cambios.referenceUrls;
  // `undefined` = no tocar. `null` = borrar. Se distinguen a propósito.
  if (cambios.dueAt !== undefined) cuerpo.dueAt = cambios.dueAt;
  if (cambios.publishedUrl !== undefined) cuerpo.publishedUrl = cambios.publishedUrl;
  if (cambios.metrics !== undefined) cuerpo.metrics = cambios.metrics;

  const response = await postWorkspaceAction('update', cuerpo);
  if (!response) return { error: 'No se pudo contactar al servidor.' };
  if (response.error) return { error: String(response.error) };
  return { actualizado: (response.actualizado as string[]) ?? [] };
}

/**
 * Votar en la revisión interna.
 *
 * El token del votante se genera y se guarda en el navegador, una sola vez. No
 * es un email ni un id de usuario: es un valor opaco que solo sirve para que este
 * navegador no pueda votar dos veces en la misma idea. Quien lo tenga puede
 * cambiar de opinión (el servidor hace upsert), pero no duplicar el voto.
 */
const LLAVE_VOTANTE = 'rr-hub-votante-v1';

/**
 * Identidad de votante, estable por navegador.
 *
 * `crypto.randomUUID` no está en todos los contextos (y en un iframe puede no
 * estar), así que se cae a `getRandomValues` y, en último caso, a una cadena
 * derivada del entorno. Lo que importa es que sea OPACO e irrepetible: nunca un
 * nombre, un email o un id de usuario, porque eso sería dato personal de una
 * tercera persona en una tabla pública.
 */
export function tokenVotante(): string {
  if (typeof window === 'undefined') return '';
  const guardado = window.localStorage.getItem(LLAVE_VOTANTE);
  if (guardado) return guardado;

  let token = '';
  const cripto = window.crypto;
  if (cripto?.randomUUID) {
    token = cripto.randomUUID();
  } else if (cripto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cripto.getRandomValues(bytes);
    token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Sin Web Crypto no hay token: se devuelve vacío y la API lo rechaza con un
  // error claro. Es preferible a inventar un token predecible, que alguien
  // podría copiar del `localStorage` de otro.
  if (!token) return '';

  window.localStorage.setItem(LLAVE_VOTANTE, token);
  return token;
}

export type VotoResultado = {
  error?: string;
  aFavor?: number;
  enContra?: number;
  gano?: boolean;
  estado?: string;
  /**
   * Qué decidió la votación, según el servidor: `ganada`, `perdida` o
   * `esperando`.
   *
   * Antes solo venía `gano`, y con la regla de mayoría simple a secas eso bastaba.
   * Con el mínimo de tres, `gano === false` ya no distingue "no ha voted enough"
   * de "se decidió en contra", y la diferencia importa: una deja la pieza donde
   * está y la otra la devuelve a revisión interna. Los dos vienen del servidor,
   * calculados en `flow.ts`.
   */
  votacion?: 'ganada' | 'perdida' | 'esperando';
  /** Cuántos votos faltan para que la votación decida. */
  faltan?: number;
  /** El mínimo vigente, para poder decirlo en el texto sin inventarlo. */
  minimo?: number;
  /**
   * Cuántas personas han pedido un cambio.
   *
   * No es un voto: no cuenta para el mínimo ni gana ni pierde. Pero sí mueve la
   * pieza, y la interfaz tiene que decirlo o alguien cree que su "cambiar esto"
   * se perdió.
   */
  cambiosPedidos?: number;
  /**
   * La respuesta de CADA persona, no solo el total.
   *
   * Es lo que permite pintar un emoji por persona —un pulgar arriba, uno abajo,
   * un 6-7— en vez de un número suelto. Sin esto, "3" no dice si son tres
   * pulgares o tres pedidos de cambio.
   */
  detalle?: DecisionVoto[];
};

export async function voteIdea(
  ideaId: string,
  decision: DecisionVoto,
  nota = '',
  voterProfile = '',
): Promise<VotoResultado> {
  const token = tokenVotante();
  if (!token) {
    return { error: 'Este navegador no puede emitir un voto con seguridad.' };
  }
  // MEDIDO 2026-10-03: el perfil elegido viaja como `voterProfile`, NO como
  // `voterEmail`. El nombre importa por lo que dice el servidor: `voterEmail` es
  // un campo que la ruta de vote IGNORA a propósito, para que escribir el correo
  // de otra persona en el cuerpo no vote en su nombre. Mandar el perfil por
  // otro nombre hace imposible confundir los dos caminos.
  if (!voterProfile) {
    return { error: 'Elige con qué perfil vas a votar antes de emitir tu voto.' };
  }
  // `note` va siempre, también vacío: la API lo ignora en `yes` y `no` y lo exige
  // en `change` y `note`. Mandarlo siempre evita tener que decidir en el
  // navegador si el campo va o no, y que aparezca el aviso de "no dice qué
  // cambiar" sin que se haya escrito nada.
  const response = await postWorkspaceAction('vote', {
    ideaId, voterToken: token, decision, note: nota, voterProfile,
  });
  if (!response) return { error: 'No se pudo contactar al servidor.' };
  if (response.error) return { error: String(response.error) };
  return {
    aFavor: Number(response.aFavor ?? 0),
    enContra: Number(response.enContra ?? 0),
    gano: Boolean(response.gano),
    estado: String(response.estado ?? ''),
    votacion: (response.votacion as VotoResultado['votacion']) ?? 'esperando',
    faltan: Number(response.faltan ?? 0),
    minimo: Number(response.minimo ?? 0),
    cambiosPedidos: Number(response.cambiosPedidos ?? 0),
    detalle: Array.isArray(response.detalle) ? (response.detalle as DecisionVoto[]) : [],
  };
}

/**
 * El roster del proyecto, para nombrar a un responsable.
 *
 * Solo se devuelven perfiles que tienen `rr_hub_access` en ESTE proyecto: la
 * lista no es "todos los de RR Aliados", es "los que pueden recibir una pieza".
 * El `userId` viaja al servidor, que vuelve a comprobar el acceso antes de
 * escribir; esta lista es la comodidad, no la autoridad.
 */
export type RosterMember = { userId: string; nombre: string; rol: string; email: string | null };

export async function loadRoster(projectSlug: string): Promise<RosterMember[]> {
  // Va por el servidor y no por el cliente de Supabase del navegador: el RLS de
  // `rr_hub_access` no deja leerlo sin ir por la clave del servidor. Además no
  // hay FK entre `rr_hub_access` y `rr_hub_profiles`, así que el join anidado
  // devolvía PGRST200 — que PostgREST reporta como `data = null` y la interfaz
  // pintaba como "no hay nadie".
  const response = await postWorkspaceAction('roster', { projectSlug });
  // El servidor ya devuelve el roster con la forma correcta; se narrow porque
  // el transporte es genérico y no conoce la forma de cada acción.
  const lista = (response?.roster as RosterMember[] | undefined) ?? [];
  return Array.isArray(lista) ? lista : [];
}

/**
 * Nombra a una persona real como responsable de la pieza.
 *
 * El `userId` NO es autoridad: el servidor comprueba que esa persona tenga
 * acceso al proyecto y exige rol `owner` para asignar. Escribir en `created_by`
 * es metadata, no un cambio de fase, así que no pasa por `allowedTransitions()`.
 */
export async function assignOwner(input: { ideaId: string; projectSlug: string; userId: string }): Promise<{ error?: string; nombre?: string }> {
  const response = await postWorkspaceAction('assign', {
    ideaId: input.ideaId, projectSlug: input.projectSlug, userId: input.userId,
  });
  return response ?? {};
}

/** Idea creation, including the sequential `code`. The server owns both. */
export async function createIdea(input: {
  projectSlug: string; title: string; description: string; objective: string;
  contentType: 'organic' | 'paid'; category: string; referenceUrls: string[];
  cameraBrief: string; talentBrief: string; editBrief: string; script: string;
  /**
   * El puntero al anuncio de la biblioteca (`rr_hub_ad_library.id`), no su
   * texto. Es lo que hace que la ficha se lea por relación: corregir el anuncio
   * actualiza lo que dicen las piezas que lo usan. Va solo, y el servidor
   * descarta un id que no pertenezca a este proyecto.
   */
  adId?: string | null;
  /**
   * Quien aporta la idea. El formulario de alta siempre manda `manual` porque
   * es un formulario que rellena una persona; `asistente` lo mandan las
   * herramientas de generación, que lo declaran ellas mismas. El servidor
   * descarta cualquier otro valor.
   */
  /**
   * NO SE USA. Antes se mandaba en el cuerpo y el servidor se lo creia, con lo
   * que cualquier persona con sesion podia declarar sus ideas como montadas por
   * Hermes. El valor lo decide el servidor leyendo la cabecera `x-rr-origen`, y
   * el navegador no tiene forma de pedir 'asistente'. Este campo queda como
   * marca para que el error no vuelva a cometerse al escribir aqui.
   */
  origen?: never;
}): Promise<{ error?: string; id?: string }> {

  // La identidad va en la cookie de la puerta, que el navegador manda solo.
  // Antes hacía falta un token en la cabecera: sin él el servidor veía a nadie
  // y crear ideas quedaba roto con un 401.
  const response = await fetch('/api/workspace/create-idea', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    // OJO: `origen` NO va en el cuerpo. El servidor lo decide el (ver `CABEZA_ORIGEN`
    // en la ruta). Mandarlo aqui era lo que permitia declararse 'asistente'.
    body: JSON.stringify({ ...input, origen: undefined }),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string; id?: string } | null;
  if (!response.ok) return { error: payload?.error ?? `No se pudo crear la idea (${response.status}).` };
  return { id: payload?.id };
}

export async function saveIdeaScript(input: { ideaId: string; script: string; role: RoleKey }): Promise<{ error?: string }> {
  // Saving a script is not a state transition. The original version stamped a
  // `script_in_progress` event on every save, so the traceability timeline
  // listed moves that never happened. The server route writes no event either.
  const response = await postWorkspaceAction('script', { ideaId: input.ideaId, script: input.script });
  return response ?? {};
}
export async function uploadAsset(input: {
  ideaId: string;
  projectSlug: string;
  stage: AssetStage;
  file: File;
  versionLabel: string;
}): Promise<{ error?: string }> {
  const maxSize = 50 * 1024 * 1024;
  if (input.file.size > maxSize) return { error: 'El archivo supera el límite de 50 MB.' };

  // ⚠️ Esta lista TIENE que ser la misma que `storage.buckets.allowed_mime_types`
  // del bucket, y además con los MISMOS valores exactos.
  //
  // Storage compara esa columna por igualdad EXACTA, no por prefijo: con `image/`
  // en la lista, subir un `image/png` daba `415 InvalidMimeType`. Y el filtro se
  // comprueba al SUBIR, así que un tipo que el bucket rechaza aquí se traduce en
  // un error de storage en vez de un mensaje que diga qué hacer. Medido el
  // 2026-09-28: image/png → 403 (pasa el filtro), video/mp4 y application/pdf → 415.
  //
  // Decisión de Santiago (2026-09-28): solo imágenes, sin video ni documentos.
  // Antes esta función aceptaba `video/`, PDF y DOCX, y el bucket los rechaza:
  // el usuario elegía un vídeo, lo subía y se comía un 415 sin explicación.
  // Dos filtros que no coinciden no cumplen ninguno: el del servidor manda y el
  // del cliente tiene que decir exactamente lo mismo, no ser más ancho.
  const BUCKET_MIMES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/avif', 'image/heic', 'image/heif',
  ];
  if (!BUCKET_MIMES.includes(input.file.type)) {
    return {
      error: `El bucket solo admite imágenes (${BUCKET_MIMES.map((m) => m.replace('image/', '.')).join(' ')}). Este archivo es ${input.file.type || 'un tipo desconocido'}.`,
    };
  }

  // Los bytes van al servidor, no a Storage con la clave del navegador.
  //
  // Antes se subían directos con la clave anónima y las políticas de
  // `storage.objects` eran para el rol `authenticated`, que ya no existe desde
  // la puerta por código. Medido el 2026-09-28: `403 new row violates row-level
  // security policy` para cualquier persona del equipo. La subida estaba rota y
  // no se notaba, porque el error se veía como "no se pudo subir" y no como
  // "el hub no puede escribir".
  //
  // Además el id de quien sube ya no lo pone el cliente: el servidor lo saca de
  // la cookie firmada y arma la ruta. Antes la ruta la escribía el navegador, y
  // el nombre del archivo lo elegía quien subía.
  const bytes = await leerComoBase64(input.file);
  if (!bytes) return { error: 'No se pudo leer el archivo. Prueba con otro.' };

  const respuesta = await fetch('/api/subir', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectSlug: input.projectSlug,
      ideaId: input.ideaId,
      stage: input.stage,
      fileName: input.file.name,
      mimeType: input.file.type,
      versionLabel: input.versionLabel,
      bytes,
    }),
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null) as { error?: string } | null;
    return { error: cuerpo?.error ?? `No se pudo subir el archivo (${respuesta.status}).` };
  }
  return {};
}

/**
 * El archivo entero en base64, sin trocear.
 *
 * `FileReader` sobre un `ArrayBuffer` completo, y no `readAsDataURL`: el
 * resultado de este último trae el prefijo `data:image/png;base64,` que el
 * servidor no espera, y además hay que quitarlo. MenosSurface que un `split`.
 */
function leerComoBase64(archivo: File): Promise<string | null> {
  return new Promise((resolver) => {
    const lector = new FileReader();
    lector.onerror = () => resolver(null);
    lector.onload = () => {
      const resultado = String(lector.result ?? '');
      const coma = resultado.indexOf(',');
      resolver(coma >= 0 ? resultado.slice(coma + 1) : resultado || null);
    };
    lector.readAsDataURL(archivo);
  });
}

export async function signedAssetUrl(path: string): Promise<string | null> {
  if (!path || /^https?:\/\//.test(path)) return path || null;
  // La lista la hace el servidor. Antes se llamaba a Storage desde el navegador
  // con la clave anónima para comprobar que el archivo existe; con la puerta
  // por código esa clave no lee el bucket y la comprobación devolvía siempre
  // "no está", o sea que toda imagen ya subida se veía rota.
  const existe = await comprobarArchivo(path);
  if (!existe) return null;
  return rutaPublica(path);
}

async function comprobarArchivo(path: string): Promise<boolean> {
  try {
    const respuesta = await fetch(`/api/archivo?path=${encodeURIComponent(path)}`, {
      cache: 'no-store', credentials: 'same-origin',
    });
    if (!respuesta.ok) return false;
    const cuerpo = await respuesta.json() as { existe?: boolean };
    return cuerpo.existe === true;
  } catch { return false; }
}

function rutaPublica(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return base ? `${base}/storage/v1/object/public/rr-content-assets/${path}` : path;
}

export function looksLikeUrl(value: string): boolean {
  const text = value.trim();
  if (!text) return true;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * A deterministic first draft keeps the workspace useful even without an AI
 * key. It is deliberately editable: a future provider can replace this with
 * a richer draft without changing the data model or the team workflow.
 */
/**
 * Genera el primer brief de la pieza a partir de lo que escribió quien la creó.
 *
 * Por qué cambió (2026-09-27): el texto era genérico y no miraba la referencia.
 * Si la referencia es un reel de Instagram, el guion no decía qué hay que
 * aprender de ese reel: solo repetía "la referencia". Quien recibía la pieza
 * tenía que abrir el enlace por su cuenta para saber de qué se trata.
 *
 * Ahora mira la referencia y escribe qué se debe copiar de ella: el formato
 * (reel / post / horizontal) y la red. Sin inventar: si no se pudo leer el
 * post, lo dice y pide abrirlo antes de rodar.
 */
export function buildIdeaPack(input: { title: string; objective: string; description: string; reference: string }) {
  const title = input.title.trim() || 'la pieza';
  const objective = input.objective.trim() || 'conectar la pieza con la audiencia';
  const concept = input.description.trim() || 'la referencia visual seleccionada';
  const ref = input.reference.trim();
  const fuente = ref ? describeReference(ref) : null;

  return {
    camera: `Plano de apertura que sitúe ${title}. ${fuente?.comoRodear ?? 'Sigue la energía de la referencia y prioriza textura, producto y un cierre limpio.'} Objetivo de cámara: ${objective}.`,
    talent: `${fuente?.comoActuar ?? 'Actitud natural y segura.'} Vestuario coherente con ${title}; evita gestos sobreactuados.${fuente?.sobreTalento ? ` La referencia trabaja así: ${fuente.sobreTalento}` : ''}.`,
    edit: `${fuente?.comoEditar ?? 'Ritmo directo: abre con el gesto o detalle más fuerte, conserva una idea por plano y cierra con la acción principal.'} Mantén como guía: ${concept}.`,
    script: `TÍTULO: ${title}

OBJETIVO
${objective}

QUÉ ESTAMOS COPIANDO DE LA REFERENCIA
${fuente?.referencia ?? (ref ? 'Referencia enlazada, sin metadatos públicos: ábrela antes de rodar.' : 'Pendiente de enlace visual.')}

1. GANCHO (0–2 s)
Muestra el detalle o acción más atractivo de la referencia.

2. DESARROLLO (2–8 s)
Cuenta una sola idea: ${concept}.

3. CIERRE (8–12 s)
Termina con producto, gesto o mensaje claro que conecte con el objetivo.

REFERENCIA
${ref || 'Pendiente de enlace visual.'}`,
  };
}

/** Qué se puede leer de la referencia sin inventar nada. */
function describeReference(url: string) {
  const lower = url.toLowerCase();
  const esReel = /instagram\.com\/(reel|reels|tv)\//.test(lower);
  const esPost = /instagram\.com\/(p|posts)\//.test(lower);
  const esTikTok = lower.includes('tiktok.com');
  const esYouTube = lower.includes('youtube.com') || lower.includes('youtu.be');
  const esDrive = lower.includes('drive.google.com');

  if (esReel) return {
    referencia: 'Reel vertical de Instagram: se sostiene de pie y dura poco.',
    comoRodear: 'Formato vertical, un solo plano por idea y ritmo corto: en un reel no hay tiempo de montar.',
    comoActuar: 'La persona entra ya en movimiento: gesto claro desde el primer segundo.',
    sobreTalento: 'postura activa, sin colocación previa.',
    comoEditar: 'Cortes cada 1–2 s, sin transiciones, y el último plano se queda quieto para que se lea el mensaje.',
  };
  if (esPost) return {
    referencia: 'Post de Instagram: imagen fija, no video.',
    comoRodear: 'Una sola toma, encuadre pensado para verse pequeño en el feed.',
    comoActuar: 'Pose o gesto que se sostenga en una foto, no una acción en movimiento.',
    comoEditar: 'Si se arma video, partir de esa imagen: mismo encuadre, misma luz, mismo sujeto.',
  };
  if (esTikTok) return {
    referencia: 'Video de TikTok: vertical, con texto sobreimpreso y música.',
    comoRodear: 'Vertical, plano corto, y dejar espacio arriba y abajo para el texto que pone TikTok.',
    comoActuar: 'Ritmo de TikTok: entra directo, sin presentación.',
    comoEditar: 'Corte al ritmo, con el texto encima; el audio suele ser parte del mensaje.',
  };
  if (esYouTube) return {
    referencia: 'Video de YouTube: horizontal y con narración.',
    comoRodear: 'Horizontal, y el primer segundo tiene que aguantar un título o una voz encima.',
    comoActuar: 'Hablar a cámara o narrar con naturalidad: el formato tolera más texto que un reel.',
    comoEditar: 'Ritmo de quien explica, con planos de apoyo para que no pese solo la voz.',
  };
  if (esDrive) return {
    referencia: 'Archivo de Google Drive: la referencia es un archivo, no un post.',
    comoRodear: 'Ábrelo antes de rodar: puede ser una imagen, un guion o un video subido.',
    comoEditar: 'Definir la duración después de ver el archivo, no antes.',
  };
  return null;
}
