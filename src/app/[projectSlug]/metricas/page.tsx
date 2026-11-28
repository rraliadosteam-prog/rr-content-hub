import { getIdeas, getProject, getVotosDeVarias, getVotosDeCambio } from '@/lib/data';
import { notFound } from 'next/navigation';
import { QueueSection } from '@/components/queue-section';
import { GraficasBanco } from '@/components/graficas-banco';
import { todasLasGraficas } from '@/lib/graficas';
import { inQueue } from '@/lib/queues';
import { DEMO_MODE } from '@/lib/demo-mode';

/**
 * This page used to be a byte-for-byte copy of `publicaciones` with different
 * copy: same queue, same filter, and it computed no metric at all. It now shows
 * the real counts, which is the only thing "MÉTRICAS" can honestly claim today.
 */
export default async function Metrics({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const { project, access } = await getProject(projectSlug); if (!project) notFound();
  if (!DEMO_MODE && !access) {
    return <main className="min-h-screen bg-negro px-5 py-16 text-blanco md:px-10"><div className="mx-auto max-w-2xl border border-mostaza-40 bg-blanco-05 p-6"><p className="eyebrow text-mostaza">[MÉTRICAS PROTEGIDAS]</p><h1 className="mt-3 font-display text-3xl font-bold">Este tablero es privado.</h1><p className="mt-4 text-sm leading-7 text-blanco-70">Los resultados de publicaciones contienen información del proyecto. Entra con el acceso de RR o del cliente correspondiente; si no tienes el código, solicítalo a Dirección.</p></div></main>;
  }
  const todasLasIdeas = await getIdeas(project.id);
  const ideas = todasLasIdeas.filter((idea) => inQueue(idea.status, 'publicaciones'));

  // MEDIDO 2026-10-03: estas cuatro líneas son la razón de que esta pantalla
  // dejara de verse vacía. `publicaciones` está en CERO (0 piezas `published`
  // de 61), y la página solo miraba esa cola. El banco entero sí tiene fases,
  // aristas y votos, y eso es lo que ahora se grafica arriba del todo.
  const votos = await getVotosDeVarias(todasLasIdeas.map((i) => i.id));
  const cambiosPedidos = await getVotosDeCambio(project.id);
  const graficas = todasLasGraficas(todasLasIdeas, votos, cambiosPedidos);

  const published = ideas.filter((i) => i.status === 'published');
  const organic = published.filter((i) => i.content_type === 'organic');
  const paid = published.filter((i) => i.content_type === 'paid');
  const byPillar = new Map<string, number>();
  for (const idea of published) {
    const key = idea.category || 'Sin categoría';
    byPillar.set(key, (byPillar.get(key) ?? 0) + 1);
  }
  const top = [...byPillar.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return <>
    <GraficasBanco graficas={graficas} />
    <QueueSection
      title="MÉTRICAS"
      eyebrow={`${project.name} · PERFORMANCE_LOOP`}
      description="Cuenta lo que sí se puede contar hoy: cuántas piezas salieron, de qué tipo y de qué categoría. El rendimiento (alcance, interacción, conversión) no se mide todavía porque ninguna tabla lo registra."
      owner="MEDIA BUYER · OWNER DEL PROYECTO"
      guide="Esta pantalla mide lo que existe en la base: piezas publicadas y su reparto. La URL de salida, la fecha y los resultados se registran en cada ficha (columnas published_url, due_at y metrics, MEDIDAS el 2026-10-01: existen y funcionan). Lo que no hay todavía es quién los carga: eso es trabajo del equipo, no una limitación de la base."
      ideas={ideas}
      projectSlug={projectSlug}
      empty="No hay publicaciones registradas todavía. Cuando la primera pieza salga, aquí se cuenta."
    />
    {published.length > 0 && <section className="mx-auto mt-4 max-w-7xl px-5 md:px-10">
      <p className="mono-label text-blanco-50">[LO QUE SÍ PODEMOS MEDIR HOY]</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {[['PUBLICADAS', published.length], ['ORGÁNICO', organic.length], ['PAUTA', paid.length]].map(([label, n]) => (
          <div key={String(label)} className="border border-blanco-20 p-4">
            <p className="font-mono text-[10px] text-blanco-60">{label}</p>
            <p className="mt-1 font-display text-3xl font-bold text-blanco">{n}</p>
          </div>
        ))}
      </div>
      {top.length > 0 && <div className="mt-4 border border-blanco-20 p-4">
        <p className="mono-label text-blanco-50">[REPARTO POR CATEGORÍA]</p>
        <ul className="mt-3 space-y-2">
          {top.map(([cat, n]) => (
            <li key={cat} className="flex items-center justify-between border-b border-blanco-10 pb-2 font-mono text-xs">
              <span className="text-blanco">{cat}</span>
              <span className="text-blanco-60">{n}</span>
            </li>
          ))}
        </ul>
      </div>}
      <p className="mt-4 border-l-4 border-blanco-20 bg-blanco-05 p-4 text-xs leading-6 text-blanco-60">
        Alcance, interacción y conversión no se miden todavía: ninguna tabla registra
        ese dato. Hasta que exista, esta página solo cuenta piezas, no rendimiento.
      </p>
    </section>}
  </>;
}
