import { notFound } from 'next/navigation';
import { getProject, getClientesDeLaPersona } from '@/lib/data';
import { rolEnProyecto } from '@/lib/project-guard';
import { WorkspaceShell } from '@/components/workspace-shell';
import { planPublicacionDe } from '@/lib/social-planning';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  if (!project) notFound();
  // El rol se resuelve en el servidor, nunca se pasa fijo. Con `role="owner"`
  // hardcodeado, un cliente de solo lectura veía el botón de crear y lo
  // descubría pulsándolo: la interfaz anunciaba una permiso que el servidor
  // iba a rechazar.
  const veredicto = await rolEnProyecto(project.id);

  // La lista de clientes va aquí, en el servidor, y no se pide desde el
  // navegador: leer `rr_hub_access` con la anon no devuelve nada (el RLS la
  // cerró), así que un selector cliente se pintaría siempre con candados.
  //
  // Y no es solo para pintar: el servidor de `/api/cambiar-cliente` vuelve a
  // comprobar la fila antes de firmar la cookie nueva. Esta lista dice qué se
  // puede pulsar; la fila de la base decide qué se puede abrir.
  const clientes = await getClientesDeLaPersona();

  // El plan de publicación solo existe para los clientes que lo tienen. La
  // entrada de menú se decide AQUÍ, en el servidor, con el mismo dato que usa
  // la página: así el enlace y la pantalla nunca discrepan. Un enlace que
  // lleva a un 404 es peor que no tener el enlace.
  const tienePlanSocial = planPublicacionDe(projectSlug) !== null;

  return (
    <WorkspaceShell
      project={project}
      role={veredicto.rol}
      email={veredicto.email ?? undefined}
      // Misma regla que la API: sin sesión no hay rol propio (`resolverRol`).
      puedeEscribir={veredicto.puedeEscribir}
      clientes={clientes}
      tienePlanSocial={tienePlanSocial}
    >
      {children}
    </WorkspaceShell>
  );
}
