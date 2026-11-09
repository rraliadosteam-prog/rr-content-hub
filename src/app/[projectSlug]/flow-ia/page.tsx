import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GoogleFlowPanel } from '@/components/google-flow-panel';
import { getProject } from '@/lib/data';

export async function generateMetadata({ params }: { params: Promise<{ projectSlug: string }> }): Promise<Metadata> {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  const nombre = project?.name ?? 'RR';
  return {
    title: `Flow · Fotos y video con IA | ${nombre}`,
    description: `Abrir Google Flow con tu cuenta personal y devolver el material al hub de ${nombre} por Drive.`,
  };
}

export default async function FlowIaPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  if (!project) notFound();

  return (
    <main className="min-h-screen bg-negro text-blanco">
      <GoogleFlowPanel
        carpetaDrive={process.env.NEXT_PUBLIC_FLOW_DRIVE_FOLDER_URL ?? ''}
        cliente={project.slug}
      />
      <div className="mx-auto max-w-6xl px-5 pb-16 md:px-10">
        <Link
          href={`/${projectSlug}/material`}
          data-testid="flow-ir-material"
          className="inline-flex min-h-[44px] items-center gap-2 border border-blanco-40 px-5 py-3 text-center font-display text-sm font-bold uppercase leading-snug tracking-tight text-blanco transition-colors hover:border-blanco hover:bg-blanco-05"
        >
          Ir a Material
          <span className="sr-only">: elegir carpeta de Drive, editar fotos y entregar</span>
        </Link>
      </div>
    </main>
  );
}
