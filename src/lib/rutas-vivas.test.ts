import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * MEDIDO 2026-10-04. Santiago: «asegurate que todas las posibles paginas
 * funcionen».
 *
 * Lo que había: 70 rutas revisadas con `curl` contra producción, y la única que
 * no respondía 200 era `/login`. ESO ESTA BIEN: la pantalla se borró el
 * 2026-10-02 y con el acceso libre no hay puerta que mostrar.
 *
 * Lo peligroso es que un 404 «correcto» se vuelva un enlace roto: alguien
 * apunta a `/login` porque siempre estuvo ahí, y quien lo pulsa recibe un 404 sin
 * explicación. Este test barre el código y falla si alguien la vuelve a
 * enlazar.
 *
 * Se mira el código SIN comentarios, porque los comentarios explican
 * precisamente que la ruta ya no existe, y un aserto que los leyera
 * reprocharía al autor por escribir por qué cambió la cosa.
 */
const RAIZ = join(__dirname, '..');
const REPO = join(RAIZ, '..');
const sinComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Todos los `.ts`/`.tsx` de `src/`, que es donde vive la navegación. */
function fuente(dir = join(RAIZ)): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...fuente(ruta));
    else if (/\.(ts|tsx)$/.test(nombre)) out.push(ruta);
  }
  return out;
}

/** Existe este archivo. */
function existeArchivo(ruta: string): boolean {
  try {
    return statSync(ruta).isFile();
  } catch {
    return false;
  }
}

describe('todas las paginas posibles funcionan', () => {
  const archivos = fuente();

  it('hay codigo que barrer', () => {
    // Un barrido sobre cero archivos pasa en verde y no ha mirado nada.
    expect(archivos.length).toBeGreaterThan(40);
  });

  it('la puerta /login existe y es la puerta canónica', () => {
    // MEDIDO 2026-11-09: `/login` era un «sin destino» — la spec v2 lo
    // declaraba inexistente y este test prohibía que nadie lo enlazara. Ahora la
    // puerta existe (es la de código de cuatro dígitos que ya había en
    // `/api/entrar`) y hay que poder entrar por ella.
    //
    // Lo que se comprueba es que la pantalla exista y que se llegue: un
    // enlace a una pantalla borrada es un 404 con un texto que promete entrar.
    expect(existeArchivo(join(RAIZ, 'app/login/page.tsx'))).toBe(true);
    expect(existeArchivo(join(RAIZ, 'app/login/formulario.tsx'))).toBe(true);
    const pagina = sinComentarios(readFileSync(join(RAIZ, 'app/login/page.tsx'), 'utf8'));
    expect(pagina).toMatch(/getClientesParaLaPuerta/);
    expect(pagina).toMatch(/Formulario/);
  });

  it('nadie enlaza a una puerta que no existe', () => {
    // La regla que sigue viva: un enlace tiene que llevar a algo. `/login`
    // dejó de estar en la lista de prohibidos porque ahora existe.
    const prohibidas = ['/login-cliente', '/entrar-cliente', '/registro'];
    const culpables: string[] = [];
    for (const abs of archivos) {
      const codigo = sinComentarios(readFileSync(abs, 'utf8'));
      for (const ruta of prohibidas) {
        if (new RegExp(`(href|redirect|push|replace)\\s*[=(]\\s*['"\`]${ruta}\\b`).test(codigo)) {
          culpables.push(`${relative(REPO, abs)} -> ${ruta}`);
        }
      }
    }
    expect(culpables, `estos enlazan a una puerta que no existe: ${culpables.join(', ')}`).toHaveLength(0);
  });

  it('el manifest tampoco manda a /login', () => {
    const manifest = sinComentarios(readFileSync(join(RAIZ, 'app/manifest.ts'), 'utf8'));
    expect(manifest).toMatch(/start_url: '\/'/);
    expect(manifest).not.toMatch(/['"`]\/login\b/);
  });

  it('toda ruta estatica de /<slug>/ideas/<id> tiene su carpeta en la base', () => {
    // MEDIDO: las fichas se enlazan por uuid, y una uuid inventada da 404 con un
    // cartel de «no encontrada» que no dice si el id esta mal o el cliente no.
    // Aqui no se comprueba la base (eso es curl contra produccion), sino que
    // el FORMATO del enlace es el que espera el servidor.
    //
    // Lo que si se fija: que las rutas de cliente que se pintan son las del
    // catalogo visible, no las cuatro de la base. Santiago 2026-10-04: «solo
    // quiero que dejes a wundeer y candilejas».
    const data = sinComentarios(readFileSync(join(RAIZ, 'lib/data.ts'), 'utf8'));
    expect(data).toContain('catalogoIncluye');
    // Y la portada no escribe slugs a mano.
    const portada = sinComentarios(readFileSync(join(RAIZ, 'app/page.tsx'), 'utf8'));
    expect(portada).toMatch(/href=\{`\/\$\{cliente\.slug\}`\}/);
  });
});
