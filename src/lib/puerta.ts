import { createServiceClient } from '@/lib/supabase/service';

/**
 * Los clientes que la puerta ofrece.
 *
 * MEDIDO 2026-10-01 (Santiago): "en la vista del link raíz solo ofrece entrar al
 * perfil de candilejas, y pues está mal". La verdad medida es que ofrecía DOS
 * puertas escritas a mano en `login/page.tsx` — wundeer y candilejas— y en
 * `rr_hub_projects` hay CUATRO clientes. Los otros dos, satiro y boga, existen
 * con sus ideas y no se veían porque la lista estaba en el código.
 *
 * Por eso la lista sale de la base y no de una constante: un cliente nuevo tiene
 * que aparecer sin que alguien recuerde editar un archivo.
 *
 * **El código va en la respuesta, y es deliberado.** El login lo necesita para
 * rellenar las cuatro casillas de alguien que lo conoce de memoria. No es una
 * credencial: es un separador de clientes. Lo que protege de verdad es la fila de
 * acceso, que se comprueba en el servidor al entrar. Aun así solo se ofrecen los
 * clientes que TIENEN código: uno sin `access_code` no se puede abrir, y un
 * botón que no abre es peor que ningún botón.
 */

export type ClientePuerta = {
  slug: string;
  nombre: string;
  color: string;
  codigo: string;
};

/** La fila de `rr_hub_projects`, tal cual la devuelve Supabase. */
export type FilaProyecto = {
  slug: string | null;
  name: string | null;
  brand_primary_color: string | null;
  access_code: string | null;
};

/**
 * La regla de la puerta: qué filas se convierten en puerta.
 *
 * Está SEPARADA de la lectura a Supabase a propósito. Los tests de este bug
 * (`puerta.test.ts`, `puerta-clientes.test.ts`) comprueban el TEXTO de los
 * archivos, y se midió que NO muerden: hacer que la función devuelva una lista
 * fija de dos clientes los deja en verde. Con la regla en una función pura se le
 * puede pasar la lista REAL de cuatro clientes de la base y ver qué sale, que es
 * lo que faltaba.
 *
 * Descarta lo que no serviría como puerta:
 * - sin código, o código vacío: el botón no abriría nada;
 * - sin slug: sin slug no hay ruta, y la ruta es lo que se comparte.
 */
export function puertaDesdeFilas(filas: FilaProyecto[]): ClientePuerta[] {
  return filas
    .filter((f): f is FilaProyecto & { access_code: string; slug: string } =>
      typeof f.access_code === 'string'
      && f.access_code.trim().length > 0
      && typeof f.slug === 'string'
      && f.slug.length > 0)
    .map((f) => ({
      slug: f.slug,
      nombre: (f.name || f.slug).toUpperCase(),
      // El color es del cliente; si no tiene, el fucsia de la casa.
      color: f.brand_primary_color || '#be076d',
      codigo: f.access_code,
    }));
}

/**
 * Lee los clientes con puerta desde la base.
 *
 * Sin base devuelve lista vacía a propósito: la puerta se queda muda y el login
 * lo dice, en vez de inventar clientes que luego abren en un 404.
 */
export async function getClientesParaLaPuerta(): Promise<ClientePuerta[]> {
  const { DEMO_MODE } = await import('./demo-mode');
  if (DEMO_MODE) {
    // MEDIDO 2026-11-09: la puerta necesita clientes con código. Sin base de
    // datos, el ejemplo ofrece los suyos: la puerta se recorre de verdad, con
    // su código y su lista de personas.
    const { demoProjects } = await import('./demo-data');
    return puertaDesdeFilas(
      demoProjects.map((p) => ({
        slug: p.slug,
        name: p.name,
        brand_primary_color: p.brand_primary_color,
        access_code: p.access_code,
      })),
    );
  }

  const supabase = await createServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('rr_hub_projects')
    .select('slug, name, brand_primary_color, access_code')
    .not('access_code', 'is', null)
    .order('created_at', { ascending: true });

  if (error || !data?.length) return [];

  return puertaDesdeFilas(data as FilaProyecto[]);
}