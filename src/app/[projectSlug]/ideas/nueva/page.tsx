import type { Metadata } from 'next';
import { NewIdeaForm } from '@/components/new-idea-form';
import { listarAnuncios, anunciosEnUso } from '@/lib/ad-library-server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { DEMO_MODE } from '@/lib/demo-mode';
import { getDemoProject } from '@/lib/demo-data';

export async function generateMetadata({ params }: { params: Promise<{ projectSlug: string }> }): Promise<Metadata> {
  const { projectSlug } = await params;
  return {
    title: `Nueva idea \u00b7 ${projectSlug} | RR Content Hub`,
    description: `Crear una nueva idea para ${projectSlug}`,
  };
}

export default async function NewIdea({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;

  // La biblioteca se lee en el servidor, no en el navegador: es una lectura de
  // `rr_hub_ad_library`, que el guard de escritura no cubre, y el selector
  // necesita saber a qué proyecto pertenece. Si el proyecto no existe, o el
  // catálogo falla, el selector se renderiza vacío y el formulario sigue
  // funcionando: crear una idea no puede depender de que un catálogo tenga filas.
  let anuncios: Awaited<ReturnType<typeof listarAnuncios>> = [];
  const usosPorAnuncio: Record<string, number> = {};
  let projectId: string | null = null;
  // Con la clave del servidor: `rr_hub_projects` ya no es legible por el
  // navegador (su tabla tiene los códigos), y esta página es de servidor.
  const supabase = (await createServiceClient()) ?? (await createClient());
  if (DEMO_MODE) {
    // MEDIDO 2026-11-09: sin base, `projectId` quedaba en `null` y el alta
    // respondía «No se pudo identificar el cliente de esta idea. Recarga la
    // página» — un mensaje que no dice qué hacer y un botón que no iba a
    // ningún sitio. En modo ejemplo el cliente es el de la URL.
    const cliente = getDemoProject(projectSlug);
    if (cliente) projectId = cliente.id;
  } else if (supabase) {
    const { data: project } = await supabase
      .from('rr_hub_projects').select('id').eq('slug', projectSlug).maybeSingle();
    if (project) {
      try {
        anuncios = await listarAnuncios(project.id);
        for (const [id, n] of await anunciosEnUso(project.id)) usosPorAnuncio[id] = n;
        projectId = project.id;
      } catch {
        anuncios = [];
      }
    }
  }

  return (
    <main className="min-h-screen bg-negro">
      <header className="border-b border-blanco-20 px-5 py-4 md:px-10">
        <div className="mx-auto flex max-w-6xl justify-between">
          <a href={`/${projectSlug}/ideas`} className="font-mono text-xs text-blanco-60 hover:text-blanco">← VOLVER</a>
          <span className="mono-label text-blanco-50">[NUEVO REGISTRO]</span>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-5 py-10 md:px-10">
        <p className="eyebrow">{projectSlug} · CAPTURA</p>
        <h1 className="display-title">Nueva idea.</h1>
        <NewIdeaForm
          projectSlug={projectSlug}
          projectId={projectId}
          anuncios={anuncios}
          usosPorAnuncio={usosPorAnuncio}
        />
      </div>
    </main>
  );
}
