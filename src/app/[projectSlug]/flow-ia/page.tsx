import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GoogleFlowPanel } from '@/components/google-flow-panel';
import { getProject } from '@/lib/data';

export async function generateMetadata({ params }: { params: Promise<{ projectSlug: string }> }): Promise<Metadata> {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  const nombre = project?.name ?? 'RR';
  return {
    title: `Flow · Fotos y video con IA | ${nombre}`,
    description: `Abrir Google Flow y devolver fotos y video al hub de ${nombre} por Drive.`,
  };
}

export default async function FlowIaPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  if (!project) notFound();

  return (
    <main className="min-h-screen bg-negro text-blanco">
      <GoogleFlowPanel
        cuentaRr={process.env.NEXT_PUBLIC_FLOW_DEFAULT_ACCOUNT ?? ''}
        carpetaDrive={process.env.NEXT_PUBLIC_FLOW_DRIVE_FOLDER_URL ?? ''}
        cliente={project.slug}
      />
    </main>
  );
}
