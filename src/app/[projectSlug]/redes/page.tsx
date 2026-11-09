import Link from 'next/link';
import { SocialPlanningShell } from '@/components/social-planning/social-planning-shell';
import { getProject } from '@/lib/data';
import { rolEnProyecto } from '@/lib/project-guard';
import { MOTIVO_SIN_PERMISO, permisosSociales, permisosSocialesDeVeredicto } from '@/lib/social-permissions';
import { quienEs } from '@/lib/quien-es';
import { planPublicacionDe } from '@/lib/social-planning';

export default async function RedesPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const plan = planPublicacionDe(projectSlug);

  // MEDIDO 2026-11-09. Antes esto era `notFound()`: SÁTIRO y BOGA, que no
  // tienen plan de publicación, devolvían un 404 con el cartel de «no
  // encontrada» — y la barra de navegación los llevaba ahí con un clic. Un 404
  // no explica nada; lo que se dice aquí es qué pasa y a dónde ir.
  //
  // Y con Sátiro ya no siendo cliente activo, su entrada de menú desaparece
  // (ver el layout del proyecto), así que a esta pantalla se llega con la
  // URL, no con un enlace roto.
  if (!plan) {
    return (
      <main className="min-h-screen bg-negro text-blanco">
        <div className="mx-auto grid max-w-3xl gap-4 px-5 py-24">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mostaza">Plan de publicación</p>
          <h1 className="display-title">Este cliente no tiene plan de publicación.</h1>
          <p className="text-base leading-8 text-blanco-70">
            El plan de publicación es un feed de ejemplo por cliente, y este cliente no lo tiene. No hay
            nada roto: el trabajo de este cliente se organiza desde su tablero.
          </p>
          <Link href={`/${projectSlug}`} className="btn-brutal inline-flex w-fit items-center gap-2">
            Volver al tablero
          </Link>
        </div>
      </main>
    );
  }

  // NX-1028 paso 3: la matriz de acceso se resuelve AQUÍ, en el servidor, con
  // el mismo `rolEnProyecto` que usa el layout del proyecto. Así lo que pinta
  // la interfaz y lo que acepta `/api/social-plan` salen del mismo rol: la
  // regla que este repo ya pagó dos veces (botón visible que devolvía 403).
  const { project } = await getProject(projectSlug);
  const sesion = await quienEs();
  const veredicto = project ? await rolEnProyecto(project.id) : null;
  // Sin cookie no hay rol propio: `rolEnProyecto` devuelve `client_viewer` como
  // degradación para no romper el resto del hub, pero la matriz del plan dice
  // que el visitante NO lee nada. Por eso el desempate es la sesión, no el rol.
  //
  // Con cookie manda el veredicto COMPLETO (NX-1030 H1): misma puerta que
  // `/api/social-plan`. Sin fila en ESTE proyecto → «Sin acceso» (una cookie
  // de otro cliente no abre aquí); sin tabla, modo demo → se lee.
  const permisos = sesion ? permisosSocialesDeVeredicto(veredicto) : permisosSociales('visitante');

  // Visitante sin acceso: no se monta ni el editor ni el autoguardado. El plan
  // es material del proyecto, no una landing.
  if (!permisos.puedeLeer) {
    return (
      <main className="min-h-screen bg-negro text-blanco">
        <div className="mx-auto grid max-w-3xl gap-4 px-5 py-24">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mostaza">Plan de publicación</p>
          <h1 className="display-title">Sin acceso</h1>
          <p data-testid="sin-acceso" className="text-base leading-8 text-blanco-70">{MOTIVO_SIN_PERMISO.leer}</p>
        </div>
      </main>
    );
  }

  return <SocialPlanningShell initialPlan={plan} permisos={permisos} />;
}
