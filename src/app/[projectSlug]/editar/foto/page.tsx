import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PhotoStudio from '@/components/estudio/photo-studio';
import { getProject } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ projectSlug: string }> }): Promise<Metadata> {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  const nombre = project?.name ?? 'RR';
  return {
    title: `Editar foto · dentro del hub | ${nombre}`,
    description: `Editor de foto en el navegador: capas, recorte, ajustes, filtros, texto y quitar fondo (básico). Sin salir del hub.`,
  };
}

/**
 * La sección «Editar foto» del hub.
 *
 * El editor vive DENTRO del Content Hub (decisión de Rosas, nota en
 * `docs/NOTA_spec_v2_editores.md`): nadie tiene que salir del hub para retocar
 * una foto. Todo el trabajo ocurre en el navegador de la persona y el archivo
 * original no se toca.
 */
export default async function EditarFotoPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  if (!project) notFound();

  return (
    <main className="min-h-screen bg-negro text-blanco">
      <div className="mx-auto max-w-[1600px] px-5 py-8 md:px-10 md:py-10">
        <header className="mb-6 max-w-3xl">
          <p className="eyebrow text-blanco-70">Estudio · dentro del hub</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-none tracking-tight text-blanco md:text-6xl">
            Editar foto
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-blanco-80 md:text-lg md:leading-8">
            Capas, recorte, ajustes, filtros, texto y «Quitar fondo (básico)». Todo se calcula en este
            navegador: el archivo original no se toca y no sale de aquí.
          </p>
        </header>

        <PhotoStudio />
      </div>
    </main>
  );
}
