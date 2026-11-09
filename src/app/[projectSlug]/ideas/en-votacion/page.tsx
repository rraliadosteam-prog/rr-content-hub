import { getIdeas, getProject, getEquipoVotante } from '@/lib/data';
import { notFound } from 'next/navigation';
import { QueueSection } from '@/components/queue-section';
import { SelectorPerfil } from '@/components/selector-perfil';

/**
 * La cola de DECISIONES DEL EQUIPO.
 *
 * MEDIDO 2026-11-09. La spec v2 pedía renombrar «Votación interna»: el nombre
 * viejo prometía una votación y lo que hay es una cola con motivo, versión y
 * siguiente paso. Aquí y en la barra la cola se llama «Decisiones del equipo»,
 * y el bloque de cada ficha dice lo mismo: son las dos puertas del mismo
 * sitio.
 *
 * MEDIDO 2026-10-03. Lo que había: en el tablero, quien entraba sin puerta veía
 * un <span> con el texto SOLO LECTURA. No era un botón, no llevaba a ninguna
 * parte y sobre todo decía una cosa falsa: que no se podía hacer nada. Lo que no
 * se podía era escribir en el tablero; la votación interna sí, y es exactamente
 * lo que el equipo viene a hacer en la reunión.
 *
 * Esta pantalla es a donde lleva ese botón. Y es la que hace útil el cambio: en
 * una lista de lo que está en votación, con el perfil elegido arriba, el equipo
 * puede recorrer las ideas y decidir sin abrir la portada ni buscar en el menú.
 *
 * Sin equipo configurado se dice, no se finge: la pantalla avisa y no lista nada
 * sobre lo que no hay.
 */
export default async function EnVotacion({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  if (!project) notFound();

  const ideas = (await getIdeas(project.id)).filter((idea) => idea.status === 'voting');
  const equipo = await getEquipoVotante();

  if (equipo.length === 0) {
    return (
      <div className="brutal-panel anim-rise p-7">
        <p className="eyebrow">[{project.name} · DECISIONES DEL EQUIPO]</p>
        <h1 className="mt-3 font-display text-2xl font-bold text-blanco">No hay nadie habilitado para votar.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-blanco-60">
          La pantalla funciona, pero no hay ninguna persona del equipo marcada como
          habilitada en la base, así que no hay nadie a quien dejar votar. Quien
          administra el hub tiene que activar las filas en
          <span className="text-blanco-80"> rr_hub_profiles</span> con
          <span className="text-blanco-80"> is_team_member</span> e
          <span className="text-blanco-80"> is_active</span> en true. No se inventan
          nombres: la lista sale de la base, no de una constante.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* El selector va ENCIMA de la lista, no en un menú aparte. MEDIDO: la
          votación se quedaba sin usar porque para emitir había que abrir el
          perfil del usuario, que era un clic extra entre "quiero votar" y "voté". */}
      <div className="brutal-panel anim-rise mb-6 p-5">
        <p className="eyebrow">[{project.name} · EQUIPO]</p>
        <p className="mt-2 text-sm leading-6 text-blanco-60">
          Elige con qué perfil del equipo vas a emitir tus decisiones. Se recuerda en
          este navegador y puedes cambiarlo entre ideas. El mínimo para que una
          decisión se tome lo pone el dominio, no esta pantalla.
        </p>
        <div className="mt-4">
          <SelectorPerfil equipo={equipo} slug={projectSlug} />
        </div>
      </div>

      <QueueSection
        title="DECISIONES DEL EQUIPO"
        eyebrow={`${project.name} · ${ideas.length} ${ideas.length === 1 ? 'PIEZA' : 'PIEZAS'}`}
        description="Estas ideas esperan la decisión del equipo. Cada una se abre con su bloque de decisión y el conteo se actualiza solo, sin recargar."
        owner="EQUIPO RR · DECISIÓN"
        guide="Elige tu perfil arriba y decide una por una. Sale al cliente la que tenga mayoría a favor con el mínimo de votos; los cambios pedidos devuelven la pieza a revisión interna."
        ideas={ideas}
        projectSlug={projectSlug}
        empty="No hay nada en votación ahora mismo."
      />
    </>
  );
}