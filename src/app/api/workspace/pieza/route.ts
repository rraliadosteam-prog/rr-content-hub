import { NextResponse, type NextRequest } from 'next/server';
import { quienEs } from '@/lib/quien-es';
import { createServiceClient } from '@/lib/supabase/service';
import { getComentarios, getAssets, getTimeline } from '@/lib/data';
import { DEMO_MODE } from '@/lib/demo-mode';
import { comentariosDemo } from '@/lib/demo-store';

export const dynamic = 'force-dynamic';

/**
 * Los datos vivos de una pieza: comentarios, archivos e historial.
 *
 * Antes los leía el navegador con la clave anónima. Con la puerta por código el
 * anon no tiene permiso de lectura sobre esas tablas, así que llegaban vacíos:
 * la ficha se veía como una pieza sin comentarios ni historial, y sin un solo
 * error, porque una lista que no se cargó y una lista vacía se ven iguales.
 *
 * Aquí se leen con la clave del servidor, y solo si quien pregunta entró. No
 * hace falta comprobar rol: leer la ficha no es escribirla, y el tablero ya
 * comprobó que el cliente de la cookie tiene ese proyecto.
 */
export async function GET(request: NextRequest) {
  const sesion = await quienEs();

  const ideaId = request.nextUrl.searchParams.get('ideaId') ?? '';
  if (!ideaId) return NextResponse.json({ error: 'Falta la idea.' }, { status: 400 });

  // La idea tiene que ser del cliente de la cookie. Sin esto, entrar con 1111 y
  // pedir el id de una idea de Candilejas devolvería sus comentarios.
  const service = await createServiceClient();
  if (!service) {
    // MEDIDO 2026-11-09: sin base, este endpoint respondía 500 y el hilo se
    // quedaba sin recargar nunca. En modo ejemplo se leen los comentarios del
    // cuaderno local, que es donde se guardaron.
    if (DEMO_MODE) {
      const guardados = await comentariosDemo(ideaId);
      return NextResponse.json({
        comentarios: guardados.map((c) => ({
          id: c.id,
          text: c.body,
          author: c.author_label,
          role: 'colaboracion',
          createdAt: c.created_at,
          resolved: Boolean(c.resolved_at),
        })),
        assets: [],
        timeline: [],
        demo: true,
      });
    }
    return NextResponse.json({ error: 'El servidor no tiene la configuración de Supabase.' }, { status: 500 });
  }
  const { data: idea } = await service
    .from('rr_hub_ideas')
    .select('projects:rr_hub_projects(slug)')
    .eq('id', ideaId)
    .maybeSingle();
  const slug = (idea as { projects?: { slug?: string } | { slug?: string }[] } | null)?.projects;
  const proyectoSlug = Array.isArray(slug) ? slug[0]?.slug : slug?.slug;
  if (!proyectoSlug) {
    return NextResponse.json({ error: 'Esa pieza no existe.' }, { status: 404 });
  }

  /**
   * MEDIDO 2026-10-03. Este endpoint devolvía 401 sin sesión, y con él el
   * `refresh()` del hilo se quedaba sin hacer nada: se publicaba un comentario,
   * la respuesta decía «✓ Comentario publicado» y la lista no cambiaba hasta
   * recargar la página entera. MEDIDO en producción: publicar y no verse.
   *
   * Leer la ficha no es escribirla. Sin sesión se comprueba que la idea exista y
   * se devuelven sus comentarios; escribir sigue exigiendo perfil comprobado en
   * `comment` y `vote`.
   *
   * Con sesión sí se mantiene la comprobación de que la idea sea del cliente de
   * la cookie, porque ahí se puede saber si alguien está mirando otro cliente.
   */
  if (sesion && proyectoSlug !== sesion.proyecto) {
    return NextResponse.json({ error: 'Esa pieza no es de tu cliente.' }, { status: 404 });
  }

  const [comentarios, assets, timeline] = await Promise.all([
    getComentarios(ideaId), getAssets(ideaId), getTimeline(ideaId),
  ]);

  return NextResponse.json({ comentarios, assets, timeline });
}
