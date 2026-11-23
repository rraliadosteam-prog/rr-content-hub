'use client';

import { IdeaOrigenChip } from '@/components/idea-origen';
import Link from 'next/link';
import { useMemo } from 'react';
import { fechaEs, cuantoPara } from '@/lib/fecha-salida';
import { StatusBadge } from './status-badge';
import { ProductionPipeline } from './production-pipeline';
import { ActorChip, Chip } from './ui/chips';
import { EmptyState } from './ui/empty-state';
import { Icon } from './ui/icons';
import { BriefRail, briefState } from './ui/meter';
import { formatOf } from './ui/cover';
import { PublicationPreview } from './ui/preview';
import { IdeaCoverFrame } from './ui/idea-cover-frame';
import { statusMeta, daysSince } from '@/lib/flow';

/** Días desde el último movimiento real de la pieza. */
function ageOf(idea: any): number | null {
  return daysSince(idea.updated_at ?? idea.created_at);
}

/**
 * Cola compartida por las cuatro fases.
 *
 * Misma gramática que el mapa: portada, estado con ícono, formato, antigüedad,
 * completitud de la información y responsable. Así una pieza se reconoce igual
 * en el tablero, en la lista y en su cola — sin reaprender nada por pantalla.
 */
export function QueueSection({ title, eyebrow, description, guide, owner, ideas, projectSlug, empty, showPipeline = false, notice }: {
  title: string; eyebrow: string; description: string; owner: string; guide: string;
  ideas: any[]; projectSlug: string; empty: string; showPipeline?: boolean;
  /** Aviso honesto cuando esta pantalla depende de algo que todavía no existe. */
  notice?: { title: string; body: string };
}) {
  /**
   * Orden por urgencia, no por código: lo que más lleva parado va arriba.
   * Medido en /aprobaciones: ordenada por código, la pieza de 15 días quedaba
   * enterrada entre las de ayer (O1, O4, O9, O11, P1, P2, P7). Una cola de
   * decisiones tiene que abrir con lo que hay que atender, no con la A.
   */
  const sorted = useMemo(
    () => [...ideas].sort((a, b) => {
      const diasA = ageOf(a) ?? -1;
      const diasB = ageOf(b) ?? -1;
      if (diasA !== diasB) return diasB - diasA;
      return (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true });
    }),
    [ideas],
  );
  const incomplete = sorted.filter((idea) => briefState(idea).some((state) => !state.done)).length;
  const oldest = sorted.reduce((max, idea) => Math.max(max, ageOf(idea) ?? 0), 0);

  return <main className="min-h-screen bg-negro">
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-10">
      <div className="anim-rise mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-blanco-10 pb-8">
        {/*
         * MEDIDO 2026-10-01: este `<div>` no llevaba `min-w-0`. En un flex, un
         * hijo sin `min-w-0` no baja de su ancho de contenido: el titular se
         * medía 476px en una ventana de 390 y la N de PUBLICACIONES se cortaba.
         * `overflow-x:hidden` en el body lo escondía, no lo arreglaba.
         */}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display-title">{title} en control.</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-blanco-70">{description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Chip icon="pieces" tone="blanco"><b className="anim-count">{sorted.length}</b>&nbsp;EN ESTA COLA</Chip>
            {oldest > 0 && <Chip icon="clock" tone="neutro"><b className="anim-count">{oldest}</b>&nbsp;DÍAS LA MÁS VIEJA</Chip>}
            <Chip icon="alert" tone="neutro"><b className="anim-count">{incomplete}</b>&nbsp;CON INFO FALTANTE</Chip>
          </div>
        </div>
        <Link href={`/${projectSlug}/ideas`} className="btn-brutal inline-flex items-center gap-2">VER BANCO <Icon name="arrow" size={14} /></Link>
      </div>

      <section className="anim-rise mb-8 flex items-start gap-3 border border-blanco-20 bg-blanco-05 p-5">
        <span className="mt-[2px] text-blanco-50"><Icon name="eye" size={16} /></span>
        <div>
          <p className="mono-label text-blanco-50">[QUÉ PASA AQUÍ]</p>
          <p className="mt-2 text-sm leading-6 text-blanco-70">{guide}</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-mostaza">RESPONSABLE · {owner}</p>
        </div>
      </section>

      {notice && <section className="anim-rise mb-8 flex items-start gap-3 border border-blanco-20 bg-blanco-05 p-5">
        <span className="mt-[2px] text-blanco-50"><Icon name="alert" size={16} /></span>
        <div>
          <p className="mono-label text-blanco-50">{notice.title}</p>
          <p className="mt-2 text-sm leading-6 text-blanco-70">{notice.body}</p>
        </div>
      </section>}

      <div className="mb-5 flex items-end justify-between border-b border-blanco-10 pb-3">
        <p className="eyebrow">[PIEZAS EN ESTA FASE]</p>
        <span className="font-mono text-[10px] text-blanco-50">PRIMERO LO QUE MÁS LLEVA PARADO</span>
      </div>

      {sorted.length ? <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((idea) => {
          const format = formatOf(idea.category, idea.content_type);
          const meta = statusMeta(idea.status);
          const age = ageOf(idea);
          const fecha = fechaEs(idea.due_at);
          const faltan = cuantoPara(idea.due_at);
          const vencido = faltan?.vencido ?? false;
          return <Link key={idea.id} href={`/${projectSlug}/ideas/${idea.id}`} className="idea-card cascade sheen group block border border-blanco-20 bg-negro transition-all duration-200 hover:border-blanco-40">
            {/* Portada real si la idea tiene brief; si no, la referencia de
                siempre. Las dos producen el mismo marco y la misma altura, así
                que la parrilla no baila al cambiar una tarjeta por otra. */}
            {idea.cover_asset
              ? <IdeaCoverFrame code={idea.code} title={idea.title} asset={idea.cover_asset} format={format.icon} />
              : <PublicationPreview url={idea.reference_url} code={idea.code} title={idea.title} format={format.icon} />}
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={idea.status} showStep={showPipeline} />
                {idea.priority === 'high' && <Chip icon="bolt" tone="neutro">ALTA</Chip>}
                {age !== null && <Chip icon="clock" tone="neutro" title={`Última actividad hace ${age} días`}>{age}D</Chip>}
                <Chip icon={format.icon} tone="neutro">{format.label}</Chip>
                {idea.origen === 'asistente' && <IdeaOrigenChip origen={idea.origen} />}
              </div>
              <h2 className="font-display text-xl font-bold leading-tight text-blanco group-hover:text-blanco-90">{idea.title}</h2>
              {idea.description && <p className="line-clamp-2 text-xs leading-5 text-blanco-60">{idea.description}</p>}
              {showPipeline && <ProductionPipeline status={idea.status} compact />}
              <BriefRail states={briefState(idea)} />
              {/* MEDIDO 2026-10-01: la fecha de salida se guardaba y no se veía
                  en ninguna parte. Una fecha invisible no es un plan. Se pinta
                  junto al responsable, que es donde se mira "qué sale y quién lo
                  tiene". */}
              {fecha && <p className="mono-label text-blanco-50">
                SALIDA · <span className={vencido ? 'text-mostaza' : 'text-blanco-80'}>{fecha}</span>
                {faltan && <span className={vencido ? 'text-mostaza' : 'text-blanco-40'}> · {faltan.texto}</span>}
              </p>}
              <div className="flex items-center justify-between gap-3 border-t border-blanco-10 pt-3">
                {meta.who === '—'
                  ? <Chip icon="check" tone="neutro">CERRADA · NADIE ESPERA</Chip>
                  : <ActorChip who={meta.who} prefix="AQUÍ ACTÚA" />}
              </div>
            </div>
          </Link>;
        })}
      </div> : <section className="border border-dashed border-blanco-20 p-6">
        <p className="eyebrow mb-4">[COLA VACÍA]</p>
        <EmptyState icon="decisions" title={empty} hint="Cuando una pieza llegue a esta fase aparecerá aquí, con su responsable y su brief." action={{ href: `/${projectSlug}/ideas`, label: 'IR AL BANCO DE IDEAS' }} />
      </section>}
    </div>
  </main>;
}
