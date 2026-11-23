import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getIdea, getProject, getProfileName, getVotos, getPresencia, getEquipoVotante, getComentarios, getAssets, getTimeline, getCoverDelAnuncio } from '@/lib/data';
import { rolEnProyecto } from '@/lib/project-guard';
import { StatusBadge, STATUS_ICON } from '@/components/status-badge';
import { IdeaActions } from '@/components/idea-actions';
import { EnhancedIdeaCollaboration } from '@/components/collaboration-enhanced';
import { AssignOwner } from '@/components/assign-owner';
import { IdeaEditor } from '@/components/idea-editor';
import { IdeaVoting } from '@/components/idea-voting';
import { PanelPresencia } from '@/components/presencia-equipo';
import { SelectorPerfil } from '@/components/selector-perfil';
import { ReferenceWithBrief } from '@/components/reference-with-brief';
import { fechaEs, cuantoPara } from '@/lib/fecha-salida';
import { IdeaCoverFrame } from '@/components/ui/idea-cover-frame';
import { IdeaOrigenChip } from '@/components/idea-origen';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ProductionPipeline } from '@/components/production-pipeline';
import { ScriptEditor } from '@/components/script-editor';
import { Chip } from '@/components/ui/chips';
import { formatOf } from '@/components/ui/cover';
import { PhaseRail, briefState } from '@/components/ui/meter';
import { PanelFaltan } from '@/components/panel-faltan';
import { Icon, type IconName } from '@/components/ui/icons';
import { statusMeta, productionStep, daysSince, type WorkflowStatus } from '@/lib/flow';

/**
 * Ficha de una pieza.
 *
 * Lo que cambió: arriba se ve la pieza como se verá publicada (preview real de
 * la referencia) junto al estado y su riel de fases, y al lado derecho aparece
 * "lo que falta" — los cinco datos que la vuelven enviable al cliente. Antes el
 * estado era un bloque de color y había que adivinar en qué punto del camino
 * estaba la pieza.
 */
export async function generateMetadata({ params }: { params: Promise<{ projectSlug: string; ideaId: string }> }): Promise<Metadata> {
  const { projectSlug, ideaId } = await params;
  const { project } = await getProject(projectSlug);
  if (!project) return { title: 'Ficha no encontrada | RR Content Hub' };
  const idea = await getIdea(project.id, ideaId);
  if (!idea) return { title: `Ficha no encontrada \u00b7 ${project.name} | RR Content Hub` };
  return {
    title: `${idea.title ?? idea.code ?? 'Ficha'} \u00b7 ${project.name} | RR Content Hub`,
    description: idea.description ?? `Ficha de ${idea.title ?? idea.code ?? 'idea'} en ${project.name}`,
  };
}

export default async function IdeaDetail({ params }: { params: Promise<{ projectSlug: string; ideaId: string }> }) {
  const { projectSlug, ideaId } = await params;

  // MEDIDO 2026-10-04 en produccion, con el dedo a 390 px: la ficha tardaba
  // 1,34 s y el TTFB era de 1,3 a 1,7 s. No era JavaScript: eran nueve viajes a
  // Supabase en cadena, cada uno abriendo su propia conexion.
  //
  // Antes era una escalera de seis `await` uno detras de otro. El orden se
  // conserva donde hay una dependencia REAL —sin `project.id` no hay idea ni rol—
  // y todo lo demas sube a `Promise.all`. `getProject` sigue primero porque de
  // el sale el 404.
  const { project } = await getProject(projectSlug); if (!project) notFound();

  // Estas dos solo necesitan `project.id`. El rol lo resuelve el servidor contra
  // `rr_hub_access`; el navegador solo lo muestra. Sin esto, `IdeaActions` caia a
  // su valor por defecto y ninguna ficha ofrecia una transicion real, ni con la
  // puerta encendida.
  const [{ rol }, idea]: any = await Promise.all([
    rolEnProyecto(project.id),
    getIdea(project.id, ideaId),
  ]);
  if (!idea) notFound();

  // Lo que sigue son seis consultas que NO se miran entre si. Antes iban en dos
  // grupos de tres y tres, esperando cada grupo al anterior. Ahora van juntas.
  //
  // El conteo de votos solo lleva los NUMEROS: el token del votante nunca sale
  // del navegador que lo genero, asi que la pagina no puede exponer quien voto
  // aunque quiera mostrarlo.
  //
  // MEDIDO 2026-10-03: el selector de perfil necesita el equipo de
  // `rr_hub_profiles`, no el de `rr_hub_presencia`, que solo dice quien se ha
  // conectado.
  //
  // Comentarios, archivos e historial llegan desde aqui, no desde el navegador: el
  // cliente anon ya no lee esas tablas y llegaban vacios sin dar error.
  //
  // MEDIDO 2026-10-01: la miniatura del anuncio de Facebook no se puede embeber ni
  // capturar al vuelo (la biblioteca pide sesion). Lo que si se puede es la que ya
  // esta guardada en la biblioteca de anuncios.
  /**
   * Las seis consultas paralelas pueden fallar por timeout de Supabase,
   * error de red o columna inexistente. En vez de dejar que un rechazo
   * tire la pagina entera (error 500 generico), se captura y se degrada
   * graceful: la ficha se pinta con los datos que SI llegaron.
   */
  let votos: Awaited<ReturnType<typeof getVotos>> = { aFavor: 0, enContra: 0, total: 0, detalle: [] };
  let presencia: Awaited<ReturnType<typeof getPresencia>> = [];
  let equipo: Awaited<ReturnType<typeof getEquipoVotante>> = [];
  let comentarios: Awaited<ReturnType<typeof getComentarios>> = [];
  let assets: Awaited<ReturnType<typeof getAssets>> = [];
  let timeline: Awaited<ReturnType<typeof getTimeline>> = [];
  let coverAnuncio: Awaited<ReturnType<typeof getCoverDelAnuncio>> = null;
  try {
    const resultados = await Promise.all([
      getVotos(ideaId),
      getPresencia(),
      getEquipoVotante(),
      getComentarios(ideaId),
      getAssets(ideaId),
      getTimeline(ideaId),
      getCoverDelAnuncio(idea.ad_id),
    ]);
    [votos, presencia, equipo, comentarios, assets, timeline, coverAnuncio] = resultados;
  } catch (e) {
    // AUDIT 2026-10-07: un fallo parcial no debe ocultar la ficha entera.
    // Se deja el valor por defecto de cada variable y se continua.
    console.error('[ideaId/page] Error cargando datos paralelos:', e);
  }

  // El responsable se resuelve en el servidor y se pasa como NOMBRE, no como
  // id: el navegador no necesita saber el uuid de nadie, y `created_by` es la
  // unica columna que lo guarda. Si no hay responsable, `null` — y el bloque lo
  // dice, en vez de inventar un nombre.
  let responsable: Awaited<ReturnType<typeof getProfileName>> = null;
  try {
    responsable = idea.created_by
      ? (await getProfileName(idea.created_by as string))
      : null;
  } catch (e) {
    console.error('[ideaId/page] Error cargando responsable:', e);
  }
  const raw = idea.reference_url ?? idea.ref ?? idea.reference_urls?.[0] ?? '';
  // La lista completa, no solo la primera: el editor tiene que ofrecer lo que hay
  // y poder quitarla. `reference_urls` es jsonb y siempre es una lista.
  const referencias: string[] = Array.isArray(idea.reference_urls)
    ? (idea.reference_urls as string[])
    : raw
      ? [raw]
      : [];
  const meta = statusMeta(idea.status);
  const inProduction = productionStep(idea.status) >= 0;
  const format = formatOf(idea.category, idea.content_type);
  const states = briefState({
    camera_brief: idea.camera,
    talent_brief: idea.talent,
    edit_brief: idea.edit,
    script_content: idea.script_content,
    reference_urls: raw ? [raw] : [],
  });
  const missing = states.filter((state) => !state.done);
  const days = daysSince(idea.updated_at ?? idea.created_at);
  // MEDIDO 2026-10-01: `due_at` se guardaba y no se veía en ninguna parte. Con
  // 14 ideas ya programadas, la ficha es donde se mira si una pieza tiene día
  // o si sigue colgando.
  const salida = fechaEs(idea.due_at);
  const faltan = cuantoPara(idea.due_at);

  return <main className="min-h-screen bg-negro">
    <header className="border-b border-blanco-20 px-5 py-4 md:px-10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <Breadcrumbs items={[
          { label: project.name, href: `/${projectSlug}` },
          { label: 'BANCO', href: `/${projectSlug}/ideas` },
          { label: idea.code ?? 'IDEA' },
        ]} />
        <StatusBadge status={idea.status} showStep animate />
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-5 sm:pb-8 md:px-10 md:py-10">
      {/* `pb-20` en móvil: la barra de la guía es `fixed` de 48 px, y como tal
          acompaña todo el scroll — no solo el final. Reservar el hueco al final
          de la página no servía: seguía pisando el brief a media ficha.
          El margen va en el contenedor del contenido, que es lo que se
          desplaza. Con `pb-16` quedaban 24 px de texto bajo la barra; `pb-20`
          (80 px) deja el final holgado. En escritorio el botón es una esquina y
          `sm:pb-8` basta. */}
      {/*
        La acción va PRIMERO, antes del título y antes de la referencia. Medido el
        2026-09-28: pegada al bloque de estado caía en y=795 con el pliegue en
        720 — 75 px por debajo, invisible. Y al ponerla en la columna derecha
        tampoco cabía.

        El orden que funciona es: acción, título, estado, referencia. Es lo que
        corresponde a la pregunta que trae a alguien aquí: "¿qué hago?".
      */}
      <div data-guia="accion" className="brutal-panel anim-rise mb-7">
        <p className="eyebrow">[TU SIGUIENTE ACCIÓN]</p>
        <h2 className="mt-3 font-display text-2xl font-bold text-blanco">Qué hacer ahora.</h2>
        <div className="mt-5"><IdeaActions projectSlug={projectSlug} ideaId={ideaId} currentStatus={idea.status} role={rol} /></div>
        {/* La votación va pegada a la acción porque en `voting` ES la acción:
            quien entra a mirar la idea viene a decidir, no a leer. */}
        <div className="mt-5">
          {/* El selector va PEGADO a la votación y no en el menú del perfil, que
              es donde vive el resto de identidad. MEDIDO 2026-10-03: el equipo
              llegaba al tablero sin puerta y veía un cartel de SOLO LECTURA. La
              votación interna es lo que el equipo hace sin ser cliente: tener
              que abrir un menú para poder votar era la razón de que no se votara. */}
          <div className="mb-4">
            <SelectorPerfil equipo={equipo} slug={projectSlug} />
          </div>
          <IdeaVoting
            ideaId={ideaId}
            status={idea.status}
            slug={projectSlug}
            equipo={equipo}
            inicial={{ aFavor: votos.aFavor, enContra: votos.enContra, detalle: votos.detalle }}
          />
        </div>
        {/* Quién está en línea, pegado a la votación: es la pregunta que se hace
            justo antes de votar ("¿a quién le pregunto?"). */}
        <div className="mt-4">
          <PanelPresencia equipo={presencia} />
        </div>
      </div>

      <div className="mb-8 border-b border-blanco-10 pb-8 anim-rise">
        <div>
          <p className="eyebrow">{idea.code ?? 'IDEA'} · {idea.content_type === 'organic' ? 'ORGÁNICO' : 'PAUTA'} · {idea.category}</p>
          <h1 className="display-title max-w-5xl">{idea.title}</h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-blanco-60 sm:text-lg sm:leading-8">{idea.description}</p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Chip icon={format.icon as IconName} tone="blanco">{format.label}</Chip>
            <Chip icon="pieces" tone="neutro">{idea.category ?? 'SIN CATEGORÍA'}</Chip>
            <IdeaOrigenChip origen={idea.origen} />
            {days !== null && <Chip icon="clock" tone="neutro">{days === 0 ? 'HOY' : `${days} DÍAS SIN MOVERSE`}</Chip>}
            {/* La fecha de salida sale con nombre y distancia, no como dato crudo. */}
            {salida && <Chip icon="calendar" tone={faltan?.vencido ? 'mostaza' : (faltan?.texto === 'hoy' ? 'fucsia' : 'neutro')}>
              SALIDA · {salida}{faltan ? ` · ${faltan.texto}` : ''}
            </Chip>}
            {missing.length
              ? <Chip icon="alert" tone="neutro">{missing.length} DATOS POR COMPLETAR</Chip>
              : <Chip icon="check" tone="neutro">FICHA COMPLETA</Chip>}
          </div>

          <div data-guia="estado" className="mt-7 border-l-4 border-blanco-40 bg-blanco-05 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center border border-blanco-30 text-blanco">
                <Icon name={STATUS_ICON[idea.status as WorkflowStatus] ?? 'flag'} size={16} />
              </span>
              <div>
                <p className="font-display text-xl font-bold text-blanco">{meta.label}</p>
                <p className="mt-1 text-xs leading-5 text-blanco-60">{meta.blurb}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <PhaseRail status={idea.status} />
              {idea.status !== 'closed' && <span className="font-mono text-[10px] text-blanco-50">AHORA ACTÚA: {meta.who}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* La referencia va a ancho completo, justo debajo del título y el estado.
          Estaba al final de la ficha, después de la trazabilidad: al abrir una
          pieza había que bajar dos pantallas para ver qué se estaba tomando como
          referencia.

          Sacarla de la rejilla de dos columnas también la arregló de paso: con
          media pantalla de ancho el brief se leía en una tira de 40 caracteres y
          el bloque medía 2493 px de alto. A ancho completo son dos columnas
          legibles. */}
      <section className="mb-8 anim-rise">
        {raw ? (
          <div data-guia="brief">
            <ReferenceWithBrief refs={referencias} url={raw} title={idea.title} coverUrl={coverAnuncio} brief={{ intention: idea.objective, camera: idea.camera, talent: idea.talent, edit: idea.edit }} />
          </div>
        ) : idea.cover_asset ? (
          /* Sin referencia la ficha no puede quedar con un hueco vacío: la
             portada sube aquí, pero con su etiqueta para que nadie la tome por
             la previsualización de la pieza. Es el hueco que se confundía antes. */
          <figure data-guia="brief" className="max-w-md border border-blanco-20 p-4">
            <figcaption className="mono-label mb-3 text-mostaza">[SIN REFERENCIA] · FOTO DE APOYO</figcaption>
            <IdeaCoverFrame code={idea.code} title={idea.title} asset={idea.cover_asset} size="lg" format={format.icon} />
            <p className="mt-3 text-xs leading-5 text-blanco-60">
              Esta pieza todavía no tiene un video de referencia. La foto es de
              apoyo, no la pieza.
            </p>
          </figure>
        ) : (
          /* Sin ninguna de las dos: se dice, en vez de dejar un espacio mudo. */
          <div data-guia="brief" className="border border-dashed border-blanco-20 px-5 py-6">
            <p className="mono-label text-mostaza">[FALTA LA REFERENCIA]</p>
            <p className="mt-2 text-sm leading-6 text-blanco-60">
              Sin el video de referencia no se puede grabar ni editar. Es el dato
              que mas bloquea esta ficha.
            </p>
          </div>
        )}
      </section>

      {/* El editor va pegado a la referencia, no escondido en un menú. Si lo que
          falta es el link, el botón tiene que estar donde se ve que falta. */}
      <div className="mb-8">
        <IdeaEditor
          ideaId={ideaId}
          role={rol}
          initial={{
            title: idea.title,
            description: idea.description,
            objective: idea.objective,
            camera: idea.camera,
            talent: idea.talent,
            edit: idea.edit,
            references: referencias,
            publishedUrl: idea.published_url,
            metrics: idea.metrics,
          }}
        />
      </div>

      {inProduction && <section className="mb-8 anim-rise">
        <p className="eyebrow mb-3">[PIPELINE DE PRODUCCIÓN]</p>
        <ProductionPipeline status={idea.status} />
      </section>}

      <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <section className="space-y-5">
          {idea.script_content && <ScriptEditor ideaId={ideaId} initialScript={idea.script_content} />}
          <div data-guia="comentarios">
            <EnhancedIdeaCollaboration
              projectSlug={projectSlug}
              ideaId={ideaId}
              comentariosIniciales={comentarios}
              assetsIniciales={assets}
              timelineInicial={timeline}
              equipo={equipo}
            />
          </div>
        </section>

        <aside className="space-y-5">
          {/* Quién responde por esta pieza. En modo abierto todo cambio queda
              como "sin sesión": honesto, pero deja la pieza sin dueño. */}
          <AssignOwner
            ideaId={ideaId}
            projectSlug={projectSlug}
            currentName={responsable?.full_name ?? null}
            canAssign={rol === 'owner'}
          />
          {/* MEDIDO 2026-10-04, Santiago: «el apartado que dice lo que falta de
              esta ficha que sea más interactivo o se me salte como en un pop up que
              son como las cosas que me faltan, para que tenga toda la
              información».

              Antes eran cinco renglones de texto gris en una caja al final de la
              columna, y el que leía el nombre de la pieza no los veía nunca.
              MEDIDO: ese bloque estaba en y=5817 con una página de 6423 px — al
              final de todo, a 6 scrolls de donde empieza la ficha.

              Ahora es un botón en la cabecera, y al tocarlo salta un panel con los
              cinco datos: los que faltan marcados en mostaza y los que ya están
              con el valor que tienen. Un «lo que falta» que solo dice qué falta
              obliga a ir a buscarlo; uno que además dice qué hay ya, sirve para
              decidir sin moverse.

              El botón no se aparece cuando no falta nada: en ese caso la pieza
              está lista y no hay nada que abrir. */}
          <PanelFaltan states={states} missing={missing} />

          {/* LA PORTADA VA AQUÍ, EN LA COLUMNA DE AL LADO Y ABAJO DE TODO.
              Santiago, 2026-09-30: "cuando uno abre una idea aparece primero como
              la foto de la portada y luego ya el vídeo, eso confunde un poco".

              El problema era de ORDEN. La portada estaba antes que la referencia, y
              una portada y una previsualización de Instagram se parecen: dos
              rectángulos con una imagen dentro. Quien abría la ficha veía una
              foto y creía que eso era la pieza; el vídeo real estaba dos pantallas
              más abajo, debajo del brief y del editor.

              Ahora el orden al abrir es: QUÉ ES → ESTADO → REFERENCIA (el vídeo) →
              BRIEF → CONVERSACIÓN. Y la portada queda en la barra lateral, con
              etiqueta, para usarla de apoyo al presentar o exportar. Si la pieza no
              tiene referencia, la portada sube al hueco de la referencia para que
              la ficha nunca quede vacía. */}
          {idea.cover_asset && (
            <figure className="border border-blanco-20 p-4 anim-rise">
              <figcaption className="mono-label mb-3 text-blanco-50">
                [FOTO DE APOYO] · NO ES LA PIEZA
              </figcaption>
              <IdeaCoverFrame
                code={idea.code}
                title={idea.title}
                asset={idea.cover_asset}
                size="md"
                format={format.icon}
              />
              <p className="mt-3 text-[11px] leading-5 text-blanco-50">
                Sirve para presentar y exportar. La idea con su brief y su
                referencia está arriba.
              </p>
            </figure>
          )}
        </aside>
      </div>

      {/* La barra de la guía ya tiene su sitio reservado con `pb-16` del
          contenedor de arriba, que es el que se desplaza. Este div sobra. */}
    </div>
  </main>;
}

