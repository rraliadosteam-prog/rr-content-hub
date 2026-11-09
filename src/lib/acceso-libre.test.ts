import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { esPublica } from './public-rutas';

/** ¿Existe este archivo? */
function existeArchivo(ruta: string): boolean {
  try {
    return statSync(ruta).isFile();
  } catch {
    return false;
  }
}

/**
 * El codigo de un archivo, SIN los comentarios.
 *
 * Hace falta porque medio codigo de este repo esta comentado explaining por que
 * se borro algo, y un test que busca `redirect(` encuentra esa explicacion y
 * falla cuando la puerta esta correctamente cerrada. Un test que no distingue
 * el codigo del comentario que lo explica no mide nada.
 */
function codigo(ruta: string): string {
  const crudo = readFileSync(join(process.cwd(), ruta), 'utf8');
  return crudo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

/**
 * La puerta del hub NO vuelve.
 *
 * Santiago, 2026-10-02: acceso libre, sin código de cuatro cifras. Estos tests
 * existen por lo que cuesta volver atrás.
 *
 * POR QUÉ UN TEST QUE BUSCA TEXTO, CUANDO LA SKILL DICE LO CONTRARIO
 *
 * `public-rutas.ts` explicaba que un test que mira texto no ve un bug de
 * comparación, y tiene razón: por eso los tests de rutas IMPORTAN la función y la
 * EJECUTAN. Eso sigue intacto abajo.
 *
 * Pero hay otra cosa que `esPublica` no puede ver: que el middleware deje de
 * llamarla, o que una pantalla de login vuelva a aparecer. Para eso hay que
 * mirar el código, y es honesto decirlo: este archivo hace las dos cosas, y cada
 * una cubre lo que la otra no alcanza.
 *
 * Y TIENEN QUE PODER PONERSE EN ROJO. Un test que comprueba que algo no existe
 * pasa en verde siempre que no se escriba el fichero, lo cual no prueba nada.
 * Para que valgan, se ejecuta contra una ruta que sí está en `CERRADAS`... que
 * hoy está vacía. Por eso el caso negativo se construye con una ruta inventada y
 * se documenta que comprueba la MECÁNICA de la función, no la política de hoy.
 */
describe('la puerta del hub se queda abierta', () => {
  it('esPublica devuelve true para todo lo que se le pase', () => {
    // La puerta abierta: cualquier ruta es pública, incluidas las APIs y las que
    // antes rebotaban.
    for (const ruta of [
      '/',
      '/login',
      '/wundeer',
      '/candilejas',
      '/satiro',
      '/boga',
      '/api/entrar',
      '/api/ideas',
      '/api/workspace/mover',
      '/auditoria',
      '/offline',
      '/manifest.webmanifest',
      '/sw.js',
    ]) {
      expect(esPublica(ruta)).toBe(true);
    }
  });

  it('no hay ninguna ruta cerrada declarada', () => {
    // Si alguien añade una entrada a CERRADAS, esto se pone rojo y tiene que llevar una explicacion
    // cuando cambia el modo de acceso: aqui esta en forma de test.
    expect(esPublica('/')).toBe(true);
    // Una ruta larga y rara tampoco debe estar cerrada "porerror".
    expect(esPublica('/api/lo-que-sea/anidado/mas')).toBe(true);
  });

  it('el middleware NO manda a /login', () => {
    // `/login` puede aparecer en un comentario que explique que ya no existe, y
    // por eso se lee el CODIGO, no el archivo entero.
    const c = codigo('src/lib/supabase/middleware.ts');
    expect(c).not.toMatch(/url\.pathname\s*=\s*'\/login'/);
    expect(c).not.toMatch(/redirect\('\/login'\)/);
  });

  it('la pantalla de login existe y es la puerta por codigo', () => {
    // MEDIDO 2026-11-09. Este test exigía que NO existiera, porque `/login` era
    // un «sin destino»: la spec v2 lo declaraba inexistente y no había ni un
    // enlace que lo llevara.
    //
    // Ahora la puerta EXISTE y es la de siempre: cuatro dígitos y tu nombre, la
    // misma que ya usaba `/api/entrar`. Lo que se comprueba es que la pantalla
    // use ese camino y no invente otro.
    let hayPantalla = true;
    try {
      readFileSync(join(process.cwd(), 'src/app/login/page.tsx'), 'utf8');
    } catch {
      hayPantalla = false;
    }
    expect(hayPantalla, 'la puerta del hub tiene que existir').toBe(true);

    const pagina = codigo('src/app/login/page.tsx');
    // La lista de clientes sale del servidor (de `rr_hub_projects`), no de una
    // constante escrita a mano.
    expect(pagina).toMatch(/getClientesParaLaPuerta/);
    // Y no se inventa una sesión de Supabase: la puerta es el código.
    expect(pagina).not.toMatch(/supabase\.auth|signInWith|signIn\(/);
  });

  it('la portada no rebota a una pantalla de acceso', () => {
    expect(codigo('src/app/page.tsx')).not.toMatch(/redirect\(/);
  });
  it('sin sesion el rol es REAL y no el mas alto', () => {
    // El fallo que este test caza, medido: `role={access?.role_in_project ?? 'owner'}`
    // daba el rol mas alto a quien no habia entrado. La pagina se abria y ensenaba
    // los botones de escribir; el guard los rechazaba al pulsarlos.
    //
    // Se comprueba contra la LISTA REAL de roles, no contra una constante del
    // propio codigo: si el rol por defecto fuera uno inventado, `tsc` no lo
    // detectaria si el tipo fuera `string`, y la pantalla compararia contra
    // strings que la base nunca tiene.
    // MEDIDO 2026-10-04. Este test exigía que el rol por defecto NO fuera `owner`,
    // y el motivo estaba escrito: «sin sesion no hay fila de acceso». Santiago
    // pidio lo contrario dos veces — «100% libre» y «todos los del equipo entran
    // como owner en todo»— y el servidor ya da owner a todo el que llega.
    //
    // El default `client_viewer` mentia: la pantalla decia LECTURA mientras el
    // servidor permitia aprobar y borrar.
    const pagina = codigo('src/app/[projectSlug]/page.tsx');
    const ROLES_REALES = [
      'owner', 'creator', 'camera', 'model', 'editor',
      'publisher', 'media_buyer', 'client_approver', 'client_viewer',
    ];
    const porDefecto = pagina.match(/role_in_project\s*\?\?\s*'([a-z_]+)'/);
    expect(porDefecto, 'no hay un rol por defecto en la pagina').not.toBeNull();
    // Sigue siendo un rol REAL de la base, no uno inventado para rellenar.
    expect(ROLES_REALES).toContain(porDefecto![1]);
    expect(porDefecto![1]).toBe('owner');

    // Y la fila real de `rr_hub_access` sigue mandando cuando existe.
    expect(pagina).toMatch(/access\?\.role_in_project/);
  });

  it('sin sesion el cliente se abre y la escritura no', () => {
    // La mitad de arriba que se abrio es la de LECTURA. Esta es la de escritura:
    // `getProject` devuelve `access: null` sin sesion, y eso es lo que leen el
    // dashboard para pintar botones y el guard de cada mutacion para decidir.
    const datos = codigo('src/lib/data.ts');

    // OJO: el corte empieza en `getProject`, NO en el primer `if (!sesion)` del
    // archivo. `getProjects` y `quienEs` tienen el suyo mas arriba, y anclar el
    // corte al primero hacia que este test mirara la funcion equivocada: se
    // ponia en verde con la escritura de `getProject` abierta de par en par.
    // Un test que pasa mientras lo que dice vigilar esta roto.
    const inicio = datos.search(/export\s+(async function|const)\s+getProject/);
    expect(inicio, 'no se encuentra getProject en lib/data.ts').toBeGreaterThan(-1);
    const cuerpo = datos.slice(inicio);
    const ramaSinSesion = cuerpo.slice(
      cuerpo.indexOf('if (!sesion)'),
      cuerpo.indexOf('if (!clienteEsVisible')
    );
    expect(ramaSinSesion.length, 'getProject no tiene la rama sin sesion').toBeGreaterThan(0);
    expect(ramaSinSesion).toMatch(/access: null/);
    // Y `clienteEsVisible` sigue mandando para quien tiene sesion: abrir la puerta
    // no abre tambien el anyadir un quinto cliente.
    expect(datos).toMatch(/clienteEsVisible\(slug, sesion\.proyecto\)/);
  });
  it('la lista de clientes NO es una constante en el codigo', () => {
    // El bug medido: `CLIENTES_CONOCIDOS = ['wundeer', 'candilejas']` escrita a
    // mano, con cuatro clientes en la base. BOGA y Satiro no se podian abrir, y
    // la portada ofrecia un enlace a BOGA que daba 404.
    //
    // Esto no puede mirar la base (un test no deberia depender de la red), asi que
    // vigila lo que si se puede: que la lista no exista como constante. Si vuelve,
    // los clientes que falten vuelven a quedar fuera sin que nada se entere.
    const c = codigo('src/lib/projects.ts');
    expect(c).not.toMatch(/CLIENTES_CONOCIDOS/);
    expect(c).not.toMatch(/const\s+CLIENTES\w*\s*=\s*\[/);
    // Y que la comprobacion de existencia sea una consulta, no un includes().
    expect(c).toMatch(/clienteExiste/);
    expect(c).toMatch(/rr_hub_projects/);
  });
  it('todo enlace a /login lleva a una pantalla que existe', () => {
    // MEDIDO 2026-11-09. Este test prohibia cualquier enlace a `/login` porque
    // la pantalla estaba borrada: un enlace a una pantalla borrada es un 404
    // con un texto que promete entrar.
    //
    // Ahora la pantalla existe, y los enlaces a ella son correctos. Lo que se
    // sigue vigilando es lo de siempre: que el enlace apunte a algo real.
    const raiz = join(process.cwd(), 'src');
    const culpables: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) { recorrer(ruta); continue; }
        if (!/\.(ts|tsx)$/.test(entrada.name)) continue;
        // El propio archivo de test se compara consigo mismo y se declararia
        // culpable.
        if (entrada.name.endsWith('.test.ts') || entrada.name.endsWith('.test.tsx')) continue;
        const limpio = readFileSync(ruta, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*/g, '')
          .replace(/\/\*([\s\S]*?)\*\//g, '');
        // Un enlace es href=".../login" o redirect('.../login').
        if (/['"\`][^'"\`]*\/login/.test(limpio)) {
          culpables.push(ruta.replace(process.cwd() + '/', ''));
        }
      }
    };
    recorrer(raiz);
    // Y la pantalla a la que apuntan está de verdad.
    expect(existeArchivo(join(process.cwd(), 'src/app/login/page.tsx'))).toBe(true);
    // Los archivos que la enlazan son los esperados: la portada y la barra.
    for (const culpable of culpables) {
      expect(
        ['src/app/page.tsx', 'src/components/workspace-shell.tsx', 'src/app/login/formulario.tsx'],
        `este archivo enlaza a /login y no se esperaba: ${culpable}`,
      ).toContain(culpable);
    }
  });
  it('las lecturas sin sesion NO filtran por cliente', () => {
    // Los dos sitios donde quedaba un filtro de "es el cliente de mi cookie":
    // `getProject` (el tablero) y `getAuditProject` (la auditoría). Los dos
    // devolvían null sin sesión y convertían cada cliente en un 404.
    //
    // La forma que NO vale es `if (!sesion || ...)`: con `!sesion` delante, sin
    // cookie se sale siempre, y el filtro solo existe para quien ya tiene sesión.
    const c = codigo('src/lib/data.ts');
    expect(c).not.toMatch(/if \(!sesion \|\| !clienteEsVisible/);
    expect(c).toMatch(/if \(sesion && !clienteEsVisible/);
  });
  it('la portada NO dice "no hay clientes" a quien no entro', () => {
    // El bug mas caro de la fusion, y no lo produjo ninguno de los dos lados.
    //
    // La portada de `main` (mas nueva y mejor) hacia `if (!sesion) return vacio`
    // en `getClientesDeLaPersona`, y luego `if (abiertos.length === 0)` para
    // pintar "Todavia no hay clientes". Con la puerta cerrada era coherente. Con
    // la puerta abierta, cualquier visitante sin cookie recibia un 200 diciendo
    // que la base estaba vacia, con los cuatro clientes dados de alta.
    //
    // Un 404 de contenido: la pagina responde bien y miente. Y es el fallo que
    // mas se propaga, porque el visitante ve "no hay nada aqui" y se va.
    const c = codigo('src/lib/data.ts');
    const i = c.indexOf('export async function getClientesDeLaPersona');
    expect(i, 'no existe getClientesDeLaPersona').toBeGreaterThan(-1);
    const cuerpo = c.slice(i, i + 1400);
    // `if (!sesion) return vacio` es la trampa: vacio antes de mirar la base.
    expect(cuerpo).not.toMatch(/if \(!sesion\)\s*return\s*vacio/);
    // Y la portada tiene que poder seguir sin sesion.
    expect(cuerpo).toMatch(/if \(sesion && !globalRole\)/);

    const portada = codigo('src/app/page.tsx');
    expect(portada).not.toMatch(/redirect\(/);
    expect(portada).toMatch(/sesion\?\.proyecto/);
  });
  it('sin sesion los clientes salen ABIERTOS, no cerrados', () => {
    // MEDIDO en produccion, con el merge ya desplegado: la raiz decia
    // "Todavia no tienes un cliente abierto" con los cuatro dados de alta.
    //
    // Arreglar solo el `if (!sesion) return vacio` NO alcanza, y por eso fallo la
    // primera vez. El filtro que deja la lista vacia es otro, mas abajo:
    // `abiertos` se armaba con `.filter((p) => rolPorProyecto.has(p.id))`, y
    // `rolPorProyecto` viene de `rr_hub_access`. Sin cookie no hay filas, los
    // cuatro caen a `cerrados`, y la pagina dice que no tienes clientes.
    //
    // O sea: la puerta no solo impedia entrar. Decidia tambien el CATALOGO.
    const c = codigo('src/lib/data.ts');
    const i = c.indexOf('const abiertos =');
    expect(i, 'no existe la linea que arma abiertos').toBeGreaterThan(-1);
    const linea = c.slice(i, c.indexOf(';', i));
    // Sin filtro por fila de acceso: quien llega sin sesion entra igual.
    expect(linea).not.toMatch(/\.filter\(/);
    // MEDIDO 2026-10-04: el default paso de `client_viewer` a `owner` con el
    // acceso libre. Lo que filtra ya no es la fila: es `HUB_CATALOGO_VISIBLE`,
    // que se aplica ANTES de armar esta lista.
    expect(linea).toMatch(/'owner'/);
  });

  it('el filtro de clientes es el catalogo, no la fila de acceso', () => {
    // MEDIDO 2026-10-04. Santiago: «solo quiero que dejes a wundeer y candilejas».
    // Boga y Satiro tienen 0 piezas y ningun access_code: se veian, se pulsaban y
    // no abrian nada.
    //
    // Ojo al orden: el corte va ANTES de decidir quien queda abierto y quien
    // cerrado. Si se filtrara despues, la separacion ya estaria decidida y solo
    // se cortaria la lista.
    const c = codigo('src/lib/data.ts');
    const iFiltro = c.indexOf('catalogoIncluye(p.slug)');
    const iAbiertos = c.indexOf('const abiertos =');
    expect(iFiltro, 'no hay filtro de catalogo').toBeGreaterThan(-1);
    expect(iAbiertos).toBeGreaterThan(-1);
    expect(iFiltro).toBeLessThan(iAbiertos);
    // Y lista vacia = se ven todos, no ninguno.
    expect(c).toMatch(/catalogoIncluye\(p\.slug\)/);
  });
});
