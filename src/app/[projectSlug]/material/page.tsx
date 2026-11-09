import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MaterialPanel } from '@/components/material-panel';
import { getProject, getProjects } from '@/lib/data';
import { leerEventosMaterial } from '@/lib/material-server';
import { credencialesDriveListas } from '@/lib/drive';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ projectSlug: string }> }): Promise<Metadata> {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  const nombre = project?.name ?? 'RR';
  return {
    title: `Material · Drive y edición | ${nombre}`,
    description: `Carpeta de Drive del equipo, edición de fotos y entrega con enlace firmado para ${nombre}.`,
  };
}

/**
 * La pantalla de material.
 *
 * Lo que el servidor trae antes de que se pinte nada:
 *
 *   - El cliente de la URL y la lista de TODOS los clientes, para poder avisar
 *     cuando un archivo es de otro.
 *   - El registro de auditoría, para que la pantalla muestre la historia
 *     aunque el navegador no llegue a talking con la API.
 *   - Si las credenciales públicas de Google están puestas. Si no lo están, el
 *     módulo lo dice y trabaja con material de ejemplo: se enseña el
 *     recorrido entero, no una pantalla en blanco.
 */
export default async function MaterialPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const { project } = await getProject(projectSlug);
  if (!project) notFound();

  const { projects } = await getProjects();
  const clientes = (projects ?? [])
    .map((proyecto: any) => ({
      slug: String(proyecto?.slug ?? ''),
      nombre: String(proyecto?.name ?? proyecto?.slug ?? ''),
    }))
    .filter((cliente) => cliente.slug);

  // El registro se muestra COMPLETO, sin filtrar por cliente: todos los
  // editores ven todo el material, y el registro es la historia de ese
  // material. Filtrarlo escondería justamente lo que el aviso de «archivo de
  // otro cliente» está tratando de enseñar.
  const eventos = await leerEventosMaterial();

  const credenciales = credencialesDriveListas({
    NEXT_PUBLIC_GOOGLE_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  });

  return (
    <main className="min-h-screen bg-negro text-blanco">
      <MaterialPanel
        cliente={projectSlug}
        nombreCliente={project.name}
        clientes={clientes}
        credenciales={credenciales}
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? ''}
        clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''}
        carpetaEquipo={process.env.NEXT_PUBLIC_FLOW_DRIVE_FOLDER_URL ?? ''}
        eventosIniciales={eventos}
      />
    </main>
  );
}
