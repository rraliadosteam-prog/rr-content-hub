import { getIdeas, getProject, getVotosDeVarias, getVotosDeCambio } from '@/lib/data';
import { notFound } from 'next/navigation';
import { QueueSection } from '@/components/queue-section';
import { GraficasBanco } from '@/components/graficas-banco';
import { todasLasGraficas } from '@/lib/graficas';
import { inQueue } from '@/lib/queues';
import { DEMO_MODE } from '@/lib/demo-mode';

type Metricas = {
  alcance?: number | null;
  interacciones?: number | null;
  conversiones?: number | null;
  nota?: string | null;
};

function numero(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('es-CO').format(value);
}

function tieneMetricas(metrics: unknown): metrics is Metricas {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return false;
  const value = metrics as Record<string, unknown>;
  return ['alcance', 'interacciones', 'conversiones', 'nota'].some((key) => value[key] !== null && value[key] !== undefined && value[key] !== '');
}

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
  const conResultados = published.filter((idea) => idea.published_url || tieneMetricas(idea.metrics));
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
      description="Muestra qué piezas salieron y, cuando el equipo registra el corte, el resultado de cada publicación. RR y el cliente autorizado ven solo este proyecto."
      owner="MEDIA BUYER · OWNER DEL PROYECTO"
      guide="Cada ficha permite registrar la URL publicada, alcance, interacciones, conversiones y nota/fuente. Esta pantalla reúne esos datos por pieza; los valores vacíos significan que aún no se ha cargado ese corte."
      ideas={ideas}
      projectSlug={projectSlug}
      empty="No hay publicaciones registradas todavía. Cuando la primera pieza salga, aquí se cuenta."
    />
    {published.length > 0 && <section className="mx-auto mt-4 max-w-7xl px-5 pb-10 md:px-10">
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
      <div className="mt-4 border border-blanco-20 bg-blanco-05 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="mono-label text-blanco-50">[RESULTADO POR PUBLICACIÓN]</p>
            <p className="mt-2 text-xs leading-6 text-blanco-60">{conResultados.length} de {published.length} piezas tienen URL o resultados registrados.</p>
          </div>
          <span className="font-mono text-[10px] text-blanco-50">VISIBLE PARA RR · CLIENTE DE ESTE PROYECTO</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {published.map((idea) => {
            const metricas = (tieneMetricas(idea.metrics) ? idea.metrics : {}) as Metricas;
            return <article key={idea.id} className="border border-blanco-15 bg-negro p-4" data-testid="metricas-publicacion">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-mostaza">{idea.code}</p>
                  <h2 className="mt-1 font-display text-lg font-bold text-blanco">{idea.title}</h2>
                </div>
                {idea.published_url ? <a href={idea.published_url} target="_blank" rel="noreferrer" className="btn-brutal shrink-0 text-xs">ABRIR PUBLICACIÓN ↗</a> : <span className="font-mono text-[10px] text-blanco-40">SIN URL</span>}
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2">
                {[['ALCANCE', metricas.alcance], ['INTERACCIONES', metricas.interacciones], ['CONVERSIONES', metricas.conversiones]].map(([label, value]) => <div key={String(label)} className="border border-blanco-10 p-3"><dt className="font-mono text-[9px] text-blanco-50">{label}</dt><dd className="mt-1 font-display text-xl font-bold text-blanco">{numero(value as number | null | undefined)}</dd></div>)}
              </dl>
              {metricas.nota && <p className="mt-3 border-l-2 border-mostaza px-3 text-xs leading-5 text-blanco-70">FUENTE / NOTA · {metricas.nota}</p>}
            </article>;
          })}
        </div>
      </div>
    </section>}
  </>;
}
