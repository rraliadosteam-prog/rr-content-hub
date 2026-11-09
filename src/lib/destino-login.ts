/**
 * A dónde se va después de entrar.
 *
 * MEDIDO 2026-10-01 (Santiago): antes esta línea era siempre `/${slug}` y
 * quien abría el enlace de una pieza terminaba en el tablero, con la impresión
 * de que el enlace estaba roto. Ahora se vuelve al sitio de donde se vino.
 *
 * La regla es restrictiva a propósito: solo se acepta un camino INTERNO que
 * empieza por `/`. Un `next` con `//evil.example` o con `https://…` se
 * descarta, porque la puerta no puede ser un redirector a otro sitio.
 */
export function destinoTrasEntrar(next: string | null | undefined, slug: string): string {
  const destino = (next ?? '').trim();
  if (!destino) return `/${slug}`;
  // Solo rutas internas de una sola barra: `//` y `/\` son URL absolutos.
  if (!destino.startsWith('/')) return `/${slug}`;
  if (destino.startsWith('//') || destino.startsWith('/\\')) return `/${slug}`;
  return destino;
}
