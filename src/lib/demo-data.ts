export type Status = 'draft' | 'pending_approval' | 'approved' | 'in_production' | 'editing' | 'ready_to_publish' | 'published' | 'needs_changes';

export type Idea = {
  id: string;
  code: string;
  title: string;
  description: string;
  objective: string;
  content_type: 'organic' | 'paid';
  category: string;
  status: Status;
  priority: 'high' | 'normal';
  creator: string;
  created_at: string;
  /**
   * MEDIDO 2026-10-01: la fecha de salida se guardaba, llegaba al servidor y se
   * perdía antes de la pantalla. Este campo no existía en el tipo, así que
   * `mapIdea` no podía devolverlo aunque lo leyera, y los componentes no
   * podían leerlo. `null` y no cadena vacía: "no hay fecha" es un hecho, y
   * `''` no lo distingue de una fecha que vino rota.
   */
  due_at?: string | null;
  /**
   * MEDIDO 2026-10-01: `rr_hub_ideas.ad_id` existe desde siempre y el alta la
   * llena (`api/workspace/[action]/route.ts:1088`), pero `getIdea` no la pedía:
   * la relación con el anuncio se perdía antes de llegar a la pantalla. Sin ella
   * no hay forma de saber que una idea viene de un anuncio concreto, ni de
   * traerle su miniatura.
   */
  ad_id?: string | null;
  published_url?: string | null;
  reference_url?: string;
  camera: string;
  talent: string;
  edit: string;
};

/**
 * Los clientes del ejemplo, con su código de puerta.
 *
 * MEDIDO 2026-11-09: la puerta (la pantalla `/login`) no existía y no había
 * forma de entrar a nada. El ejemplo necesita una puerta que funcione de
 * verdad, y para eso cada cliente tiene su código de cuatro dígitos.
 *
 * Los códigos del ejemplo son DEL EJEMPLO (`9xxx`), no los de producción:
 * una puerta de ejemplo no puede abrir la puerta de verdad. Los de
 * producción viven en `rr_hub_projects.access_code` y los edita Dirección.
 */
export const demoProjects = [
  { id: 'wundeer', name: 'WUNDEER', client_name: 'Wuundeer · Moda', slug: 'wundeer', brand_primary_color: '#be076d', description: 'Contenido orgánico y pauta para la operación crítica de moda.', access_code: '9001' },
  { id: 'satiro', name: 'SÁTIRO', client_name: 'Sátiro Sushi · Gastronomía', slug: 'satiro', brand_primary_color: '#ded116', description: 'Plataforma gastronómica, contenido y conversión local.', access_code: '9002' },
  { id: 'boga', name: 'BOGA', client_name: 'BOGA · Marca', slug: 'boga', brand_primary_color: '#973d8f', description: 'Branding, comunicación y contenido de marca.', access_code: '9003' },
];

/**
 * El equipo del ejemplo.
 *
 * Sin esta lista, el selector de perfil salía vacío y el hilo de comentarios
 * quedaba bloqueado sin que hubiera nada que elegir. Son personas de mentira
 * para un hub de mentira: sirven para recorrer el flujo, no para firmar nada.
 */
export const demoEquipo = [
  { email: 'santiago@ejemplo.local', nombre: 'Santiago (ejemplo)' },
  { email: 'manuel@ejemplo.local', nombre: 'Manuel (ejemplo)' },
  { email: 'visitante@ejemplo.local', nombre: 'Visitante (ejemplo)' },
];

export const demoIdeas: Idea[] = [
  { id: '1', code: 'O1', title: 'Macro: textura que se siente', description: 'Primerísimos planos de trama, costuras y acabados.', objective: 'Convertir la calidad del textil en una experiencia visual sensorial.', content_type: 'organic', category: 'Producto y tela', status: 'pending_approval', priority: 'high', creator: 'Manuel', created_at: '2026-08-12', reference_url: 'https://www.instagram.com/reel/DcN2tugtTc-/', camera: 'Macro / tele corto; foco manual preciso; luz lateral.', talent: 'Manos o torso. Movimientos suaves, sin actuación.', edit: 'Ritmo lento, cortes limpios y diseño sonoro textil.' },
  { id: '2', code: 'O2', title: 'Caída y movimiento de la prenda', description: 'Mostrar peso, fluidez y caída real en movimiento.', objective: 'Resolver visualmente cómo se comporta la tela antes de comprar.', content_type: 'organic', category: 'Producto y tela', status: 'approved', priority: 'normal', creator: 'Manuel', created_at: '2026-08-12', reference_url: 'https://www.instagram.com/reel/DaxKZNhN10E/', camera: '50/60 fps para movimientos clave.', talent: 'Caminar o girar sin sobreactuar.', edit: 'Slow motion selectivo y plano completo de cierre.' },
  { id: '3', code: 'O3', title: 'Ficha editorial de producto', description: 'Una referencia y sus detalles en formato guardable.', objective: 'Crear un sistema visual coherente y reutilizable para catálogo social.', content_type: 'organic', category: 'Producto y tela', status: 'in_production', priority: 'normal', creator: 'Manuel', created_at: '2026-08-13', reference_url: 'https://www.instagram.com/p/Daib70kjytb/', camera: 'Hero shot + detalles con perspectiva consistente.', talent: 'No obligatorio; pose editorial estática.', edit: 'Retícula clara, aire y jerarquía.' },
  { id: '4', code: 'O4', title: 'Gesto transformado en textil', description: 'Soltar, plegar, deslizar o extender tela para revelar color.', objective: 'Crear un gesto propio, repetible con cada lanzamiento.', content_type: 'organic', category: 'Producto y tela', status: 'needs_changes', priority: 'normal', creator: 'Manuel', created_at: '2026-08-13', reference_url: 'https://www.instagram.com/reel/DawLdzxp-Sg/', camera: 'Encuadre bloqueado para match cuts.', talent: 'Manos consistentes y ritmo repetible.', edit: 'Cortes exactos por gesto.' },
  { id: '5', code: 'O5', title: 'Exploración de texturas', description: 'Secuencia de materiales, lavados y terminaciones.', objective: 'Mostrar variedad del portafolio en una pieza sensorial.', content_type: 'organic', category: 'Producto y tela', status: 'draft', priority: 'normal', creator: 'Manuel', created_at: '2026-08-14', reference_url: 'https://www.instagram.com/reel/DW0OUWrEXXG/', camera: 'Macro consistente y exposición protegida.', talent: 'No requerido.', edit: 'Montaje por contraste de textura.' },
  { id: '6', code: 'O6', title: 'Walking clean / vida real elevada', description: 'La prenda en un contexto cotidiano aspiracional.', objective: 'Mostrar la ropa como parte de la vida diaria.', content_type: 'organic', category: 'Lifestyle clean', status: 'approved', priority: 'high', creator: 'Manuel', created_at: '2026-08-14', reference_url: 'https://www.instagram.com/reel/DVteiFfkRIG/', camera: 'Seguimiento suave con fondo sobrio.', talent: 'Caminar con actitud natural.', edit: 'Respirar entre planos; no sobrecortar.' },
  { id: '7', code: 'O7', title: 'Femenino editorial, sin artificio', description: 'Styling y movimiento con producción contenida.', objective: 'Construir una línea femenina con presencia.', content_type: 'organic', category: 'Lifestyle clean', status: 'approved', priority: 'normal', creator: 'Manuel', created_at: '2026-08-15', reference_url: 'https://www.instagram.com/reel/DYUjNWKzwzL/', camera: 'Silueta completa y detalles de fit.', talent: 'Movimientos simples y elegantes.', edit: 'Cortes por gesto.' },
  { id: '8', code: 'O8', title: 'Transiciones clean por outfit', description: 'Varios looks conectados con match cuts.', objective: 'Enseñar variedad con ritmo y ejecución precisa.', content_type: 'organic', category: 'Lifestyle clean', status: 'editing', priority: 'normal', creator: 'Manuel', created_at: '2026-08-15', reference_url: 'https://www.instagram.com/reel/DcGL6Wapcn5/', camera: 'Trípode fijo y marcas de posición.', talent: 'Repetir gesto y posición.', edit: 'Match cuts exactos.' },
  { id: '9', code: 'O9', title: 'Humor de pertenencia', description: 'Una situación de identificación alrededor del outfit.', objective: 'Humanizar la marca sin convertirla en una página de memes.', content_type: 'organic', category: 'Humor y memes', status: 'pending_approval', priority: 'normal', creator: 'Manuel', created_at: '2026-08-15', reference_url: 'https://www.instagram.com/p/Dbdq9CGkeFU/', camera: 'Plano simple y legible.', talent: 'Expresión clara y breve.', edit: 'Timing y texto breve.' },
  { id: '10', code: 'P1', title: 'Asesoría visual → WhatsApp', description: 'Producto y fit visibles desde el primer segundo.', objective: 'Llevar a la persona a pedir asesoría directa por WhatsApp.', content_type: 'paid', category: 'Conversión', status: 'ready_to_publish', priority: 'high', creator: 'Santiago', created_at: '2026-08-16', camera: 'Plano entero + detalles con luz controlada.', talent: 'Mostrar frente, lado y espalda.', edit: 'Mensaje claro en 2–3 s y CTA WhatsApp.' },
  { id: '11', code: 'P2', title: 'Tres objeciones, una prenda', description: 'Responder dudas de talla, fit y material.', objective: 'Reducir fricción antes de iniciar conversación comercial.', content_type: 'paid', category: 'Conversión', status: 'pending_approval', priority: 'high', creator: 'Santiago', created_at: '2026-08-16', camera: 'Plano medio con inserts de producto.', talent: 'Hablar a cámara con claridad.', edit: 'Subtítulos y cortes de respuesta.' },
  { id: '12', code: 'P3', title: 'Prueba social de fit', description: 'Variaciones de cuerpo y caída real.', objective: 'Aumentar confianza mostrando fit en contexto.', content_type: 'paid', category: 'Prueba social', status: 'approved', priority: 'normal', creator: 'Santiago', created_at: '2026-08-17', camera: 'Planos comparables y luz uniforme.', talent: 'Dos perfiles de talla.', edit: 'Comparación directa, sin sobretexto.' },
];

export function getDemoProject(slug: string) { return demoProjects.find((p) => p.slug === slug); }

export function getDemoIdea(id: string) { return demoIdeas.find((idea) => idea.id === id); }
