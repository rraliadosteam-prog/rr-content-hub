// Modo ejemplo: un almacén en disco para lo que se escribe en local.
//
// POR QUÉ EXISTE
//
// El hub lee y escribe en Supabase. Sin credenciales, `NEXT_PUBLIC_HUB_DEMO=true`
// levanta el hub con datos de ejemplo, pero las escrituras no tenían a dónde
// ir: `CREAR IDEA` y `ENVIAR COMENTARIO` respondían 500 y quedaban como botones
// rotos en el recorrido local.
//
// Este archivo es el equivalente del `social-store.ts` (que ya guardaba el plan
// de publicación en `.data/social/`): un almacén con interfaz, que en modo
// ejemplo es un JSON en disco y en producción es la base de datos. Aquí solo
// existe la versión de disco, porque este almacén SOLO se usa en modo ejemplo:
// en producción la escritura va a Supabase y este archivo ni se abre.
//
// LO QUE NO ES
//
//   - No es una base de datos: no hay índices, ni transacciones, ni consultas.
//   - No se versiona: `.data/` está en el `.gitignore`.
//   - No sustituye a la base real: sin Supabase, esto es un cuaderno, no el
//     sistema. Por eso la interfaz siempre dice «modo ejemplo».
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Una pieza guardada en el cuaderno de ejemplo. */
export type IdeaDemo = {
  id: string;
  code: string;
  title: string;
  description: string;
  objective: string;
  content_type: 'organic' | 'paid';
  category: string;
  status: string;
  priority: 'high' | 'normal';
  origen: 'manual' | 'asistente';
  creator: string;
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
  ad_id: string | null;
  due_at: string | null;
  published_url: string | null;
  aFavor: number;
  enContra: number;
  reference_url: string;
  reference_urls: string[];
  cover_asset: null;
  camera: string;
  talent: string;
  edit: string;
  script_content: string;
  /** Slug del cliente al que pertenece. */
  proyecto: string;
};

/** Un comentario guardado en el cuaderno de ejemplo. */
export type ComentarioDemo = {
  id: string;
  idea_id: string;
  body: string;
  author_label: string;
  role_label: string;
  created_at: string;
  resolved_at: string | null;
};

type Disco = { ideas: IdeaDemo[]; comentarios: ComentarioDemo[] };

function base(): string {
  return process.env.RR_HUB_DEMO_DIR ?? path.join(process.cwd(), '.data', 'demo');
}

function archivo(): string {
  return path.join(base(), 'hub.json');
}

async function leer(): Promise<Disco> {
  try {
    const crudo = await fs.readFile(archivo(), 'utf8');
    const dato = JSON.parse(crudo) as Partial<Disco>;
    return {
      ideas: Array.isArray(dato.ideas) ? dato.ideas : [],
      comentarios: Array.isArray(dato.comentarios) ? dato.comentarios : [],
    };
  } catch {
    // No existe o está corrupto: se empieza de cero en vez de tumbar la app.
    return { ideas: [], comentarios: [] };
  }
}

/**
 * Escribe de forma atómica (temporal + renombrado): un proceso a media
 * escritura no debe dejar el JSON partido, porque la mitad de un JSON
 * corrupto es perder todo lo que se había guardado.
 */
async function escribir(disco: Disco): Promise<void> {
  await fs.mkdir(base(), { recursive: true });
  const destino = archivo();
  const temporal = `${destino}.tmp`;
  await fs.writeFile(temporal, JSON.stringify(disco, null, 2), 'utf8');
  await fs.rename(temporal, destino);
}

/** Las piezas guardadas, de más reciente a más antigua. */
export async function ideasDemo(proyecto?: string): Promise<IdeaDemo[]> {
  const disco = await leer();
  const ideas = proyecto ? disco.ideas.filter((i) => i.proyecto === proyecto) : disco.ideas;
  return [...ideas].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Una pieza guardada por id. */
export async function ideaDemo(id: string): Promise<IdeaDemo | null> {
  const disco = await leer();
  return disco.ideas.find((i) => i.id === id) ?? null;
}

/** Guarda una pieza y la devuelve con su id y su código. */
export async function crearIdeaDemo(datos: {
  proyecto: string;
  title: string;
  description?: string;
  objective?: string;
  contentType: 'organic' | 'paid';
  category?: string;
  reference?: string;
  camera?: string;
  talent?: string;
  edit?: string;
  script?: string;
  autor?: string;
  /**
   * Códigos que ya están usados (por ejemplo, los de las piezas de ejemplo).
   * Sin esto, la primera pieza creada en una corrida repetía el O1 de las
   * fixtures y el tablero mostraba dos piezas con el mismo código.
   */
  codigosReservados?: string[];
}): Promise<IdeaDemo> {
  const disco = await leer();
  const prefijos = disco.ideas.filter((i) => i.proyecto === datos.proyecto && i.content_type === datos.contentType);
  const siguiente = [...prefijos.map((i) => i.code), ...(datos.codigosReservados ?? [])].reduce(
    (max, codigo) => Math.max(max, Number(codigo.replace(/^\D+/, '')) || 0),
    0,
  ) + 1;
  const ahora = new Date().toISOString();
  const idea: IdeaDemo = {
    id: `demo-${datos.proyecto}-${Date.now().toString(36)}`,
    code: `${datos.contentType === 'organic' ? 'O' : 'P'}${siguiente}`,
    title: datos.title,
    description: datos.description ?? '',
    objective: datos.objective ?? '',
    content_type: datos.contentType,
    category: datos.category ?? 'General',
    status: 'voting',
    priority: 'normal',
    origen: 'manual',
    creator: datos.autor ?? 'RR ALIADOS',
    created_at: ahora,
    updated_at: ahora,
    created_by: null,
    ad_id: null,
    due_at: null,
    published_url: null,
    aFavor: 0,
    enContra: 0,
    reference_url: datos.reference ?? '',
    reference_urls: datos.reference ? [datos.reference] : [],
    cover_asset: null,
    camera: datos.camera ?? '',
    talent: datos.talent ?? '',
    edit: datos.edit ?? '',
    script_content: datos.script ?? '',
    proyecto: datos.proyecto,
  };
  disco.ideas.push(idea);
  await escribir(disco);
  return idea;
}

/** Los comentarios de una pieza. */
export async function comentariosDemo(ideaId: string): Promise<ComentarioDemo[]> {
  const disco = await leer();
  return disco.comentarios
    .filter((c) => c.idea_id === ideaId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Guarda un comentario. */
export async function crearComentarioDemo(datos: {
  ideaId: string;
  body: string;
  autor: string;
  rol: string;
}): Promise<ComentarioDemo> {
  const disco = await leer();
  const comentario: ComentarioDemo = {
    id: `demo-com-${Date.now().toString(36)}`,
    idea_id: datos.ideaId,
    body: datos.body,
    author_label: datos.autor,
    role_label: datos.rol,
    created_at: new Date().toISOString(),
    resolved_at: null,
  };
  disco.comentarios.push(comentario);
  await escribir(disco);
  return comentario;
}

/** Marca un comentario como resuelto (o lo reabre). */
export async function resolverComentarioDemo(id: string, resuelto: boolean): Promise<boolean> {
  const disco = await leer();
  const comentario = disco.comentarios.find((c) => c.id === id);
  if (!comentario) return false;
  comentario.resolved_at = resuelto ? new Date().toISOString() : null;
  await escribir(disco);
  return true;
}
