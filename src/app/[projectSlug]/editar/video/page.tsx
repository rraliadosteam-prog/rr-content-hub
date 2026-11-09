import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import VideoStudio from '@/components/estudio/video-studio';
import { getProject } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ projectSlug: string }> }): Promise<Metadata> {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  const nombre = project?.name ?? 'RR';
  return {
    title: `Editar video · dentro del hub | ${nombre}`,
    description: `Editor de video en el navegador: pistas multipista, cortes, velocidad, transiciones, texto y exportación en WebM y MP4 (H.264).`,
  };
}

/**
 * La sección «Editar video» del hub.
 *
 * Igual que la de foto: el editor va DENTRO del Content Hub. Se exporta en
 * WebM (VP9 + Opus, se abre en todos lados) y en MP4 (H.264, el que piden las
 * plataformas), y el archivo se arma en el navegador de la persona.
 */
export default async function EditarVideoPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  if (!project) notFound();

  return (
    <main className="min-h-screen bg-negro text-blanco">
      <div className="mx-auto max-w-[1600px] px-5 py-8 md:px-10 md:py-10">
        <header className="mb-6 max-w-3xl">
          <p className="eyebrow text-blanco-70">Estudio · dentro del hub</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-none tracking-tight text-blanco md:text-6xl">
            Editar video
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-blanco-80 md:text-lg md:leading-8">
            Pistas multipista, cortes, velocidad, transiciones, texto y audio. La exportación sale en
            WebM y en MP4 (H.264), y se arma en este navegador: ningún archivo sale del equipo.
          </p>
        </header>

        <VideoStudio />
      </div>
    </main>
  );
}
