import { notFound } from 'next/navigation';
import { getProject, getClientesDeLaPersona } from '@/lib/data';
import { rolEnProyecto } from '@/lib/project-guard';
import { WorkspaceShell } from '@/components/workspace-shell';
import { InstalarApp } from '@/components/instalar-app';
import { planPublicacionDe } from '@/lib/social-planning';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  if (!project) notFound();
  const veredicto = await rolEnProyecto(project.id);
  const clientes = await getClientesDeLaPersona();
  const tienePlanSocial = planPublicacionDe(projectSlug) !== null;

  return (
    <WorkspaceShell
      project={project}
      role={veredicto.rol}
      email={veredicto.email ?? undefined}
      puedeEscribir={veredicto.puedeEscribir}
      clientes={clientes}
      tienePlanSocial={tienePlanSocial}
    >
      {children}
      <InstalarApp />
    </WorkspaceShell>
  );
}
