import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * EL RECORRIDO COMPLETO DEL HUB, con clics de verdad.
 *
 * Qué cubre: la puerta `/login`, la navegación agrupada, la cola de decisiones,
 * la ficha con su hilo de comentarios, el alta de una pieza, el módulo de
 * material con el editor de foto, el editor de video y el botón único de Flow.
 *
 * Para qué sirve: el inventario de botones dice que no hay ninguno roto. Eso
 * solo es verdad si alguien lo pulsó. Este recorrido pulsa.
 *
 * Corre contra el modo EJEMPLO (`NEXT_PUBLIC_HUB_DEMO=true`): sin base de
 * datos real, con el cuaderno local (`.data/demo/`) y las credenciales de
 * Google pendientes. No toca Supabase ni ningún servicio de terceros.
 */

const PROYECTO = 'wundeer';
const CAPTURAS = process.env.HUB_CAPTURAS ?? '/home/deadkiss/rr-encargos/2026-11-09_hub-D/capturas';

/** Espera a que la app esté en modo ejemplo (si no, este recorrido no aplica). */
async function esEjemplo(page: import('@playwright/test').Page): Promise<boolean> {
  const cuerpo = await page.content();
  return cuerpo.includes('EJEMPLO') || cuerpo.includes('ejemplo');
}

async function capturar(page: import('@playwright/test').Page, nombre: string) {
  await fs.mkdir(CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURAS, `${nombre}.png`) });
}

test.describe('el recorrido completo del hub', () => {
  // El recorrido es largo (puerta + once destinos + ficha + alta + material +
  // editor de foto + editor de video + Flow + auditoría) y el dev server
  // compila cada ruta la primera vez. Con los 45 s por defecto de Playwright se
  // quedaba a medias en una máquina fría.
  test.setTimeout(240_000);

  test('la puerta, la navegación y las secciones', async ({ page }) => {
    const errores: string[] = [];
    // 1280×800: el tamaño de escritorio que pide el encargo.
    await page.setViewportSize({ width: 1280, height: 800 });

    // ── 1. La portada y la puerta ────────────────────────────────────────
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: /ENTRAR/ }).first()).toBeVisible();
    await capturar(page, 'escritorio-01-portada');

    await page.getByRole('link', { name: /ENTRAR/ }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Acceder al hub' })).toBeVisible();
    await capturar(page, 'escritorio-02-puerta');

    // El código se escribe con un clic (el botón del cliente) y se sigue.
    await page.getByRole('button', { name: /Escribir el código de WUNDEER/ }).click();
    await page.getByRole('button', { name: 'CONTINUAR' }).click();
    await expect(page.getByLabel('// QUIÉN ERES')).toBeVisible();
    await capturar(page, 'escritorio-03-puerta-persona');

    await page.getByRole('button', { name: 'ENTRAR' }).click();
    await page.waitForURL(new RegExp(`/${PROYECTO}`), { timeout: 15_000 });
    await capturar(page, 'escritorio-04-tablero');

    // ── 2. La navegación agrupada: cada destino responde ────────────────
    const destinos = [
      { etiqueta: 'PIEZAS', url: `/${PROYECTO}/ideas` },
      { etiqueta: 'PRODUCCIÓN', url: `/${PROYECTO}/produccion` },
      { etiqueta: 'PUBLICACIONES', url: `/${PROYECTO}/publicaciones` },
      { etiqueta: 'MATERIAL', url: `/${PROYECTO}/material` },
      { etiqueta: 'EDITAR FOTO', url: `/${PROYECTO}/editar/foto` },
      { etiqueta: 'EDITAR VIDEO', url: `/${PROYECTO}/editar/video` },
      { etiqueta: 'FLOW · IA', url: `/${PROYECTO}/flow-ia` },
      { etiqueta: 'DECISIONES DEL EQUIPO', url: `/${PROYECTO}/ideas/en-votacion` },
      { etiqueta: 'APROBACIONES', url: `/${PROYECTO}/aprobaciones` },
      { etiqueta: 'MÉTRICAS', url: `/${PROYECTO}/metricas` },
      { etiqueta: 'HOJA DE RUTA', url: `/${PROYECTO}/roadmap` },
    ];

    for (const destino of destinos) {
      const respuesta = await page.goto(`http://localhost:3100${destino.url}`, { waitUntil: 'domcontentloaded' });
      const estado = respuesta?.status() ?? 0;
      if (estado >= 400) errores.push(`${destino.etiqueta} (${destino.url}) → HTTP ${estado}`);
      await expect(page.locator('main').first()).toBeVisible();
    }

    // ── 3. La cola de decisiones del equipo ──────────────────────────────
    await page.goto(`http://localhost:3100/${PROYECTO}/ideas/en-votacion`, { waitUntil: 'networkidle' });
    await expect(page.getByText('DECISIONES DEL EQUIPO').first()).toBeVisible();
    await capturar(page, 'escritorio-05-decisiones');

    // ── 4. La ficha: el hilo de comentarios ──────────────────────────────
    await page.goto(`http://localhost:3100/${PROYECTO}/ideas`, { waitUntil: 'networkidle' });
    // El enlace de una PIEZA, no el de «+ NUEVA» (que también vive bajo /ideas/).
    // La pieza que está en decisión: es la que tiene la tarjeta de decisión.
    const piezaEnDecision = page.locator(`a[href="/${PROYECTO}/ideas/13"]`).first();
    await piezaEnDecision.click();
    await page.waitForURL(/\/ideas\/.+/, { timeout: 15_000 });
    await expect(page.getByText('DECISIÓN DEL EQUIPO').first()).toBeVisible();

    // Elegir perfil (para poder comentar) y comentar.
    const selectorPerfil = page.getByRole('button', { name: /ELEGIR QUIÉN VOTA|CAMBIAR ·/ }).first();
    await selectorPerfil.click();
    // Las personas del equipo son `role="option"` (el desplegable es una lista).
    const opcion = page.getByRole('option', { name: /Visitante \(ejemplo\)/ }).first();
    await opcion.click();
    await expect(page.getByRole('button', { name: /CAMBIAR ·/ }).first()).toBeVisible();
    const campoComentario = page.getByPlaceholder('Escribe una decisión, duda o ajuste...');
    await campoComentario.fill('Comentario del recorrido automático.');
    const botonEnviar = page.getByRole('button', { name: /ENVIAR COMENTARIO/ });
    await expect(botonEnviar).toBeEnabled();
    await botonEnviar.click();
    await expect(page.getByText('Comentario del recorrido automático.').first()).toBeVisible({ timeout: 10_000 });
    await capturar(page, 'escritorio-06-ficha-comentario');

    // ── 5. El alta de una pieza ──────────────────────────────────────────
    await page.goto(`http://localhost:3100/${PROYECTO}/ideas/nueva`, { waitUntil: 'networkidle' });
    await page.getByLabel('TÍTULO *').fill('Pieza del recorrido automático');
    await page.getByLabel('OBJETIVO *').fill('Comprobar que el alta funciona de punta a punta');
    await page.getByLabel(/REFERENCIA \*/).fill('https://www.instagram.com/p/DEM0-recorrido/');
    await page.getByRole('button', { name: /CREAR IDEA/ }).click();
    await page.waitForURL(/\/ideas\/demo-/, { timeout: 20_000 });
    await expect(page.getByText('Pieza del recorrido automático').first()).toBeVisible();
    await capturar(page, 'escritorio-07-pieza-creada');

    // ── 6. Material: carpeta de ejemplo, listado y editor de foto ────────
    await page.goto(`http://localhost:3100/${PROYECTO}/material`, { waitUntil: 'networkidle' });
    await page.getByTestId('material-elegir-carpeta').click();
    const carpeta = page.locator('[data-testid^="material-carpeta-demo-"]').first();
    await expect(carpeta).toBeVisible();
    await carpeta.click();
    await expect(page.getByTestId('material-lista')).toBeVisible({ timeout: 15_000 });
    await capturar(page, 'escritorio-08-material');

    // Editar una foto: se abre el editor de foto DENTRO del hub.
    const botonEditar = page.locator('[data-testid^="material-editar-"]').first();
    await botonEditar.click();
    const editor = page.getByTestId('editor-foto');
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await capturar(page, 'escritorio-09-editor-foto');

    // El botón de guardar NO puede quedar tapado por el botón de la guía.
    const botonGuardar = page.getByRole('button', { name: /Guardar versión editada/ });
    await expect(botonGuardar).toBeVisible();
    const guia = page.getByTestId('boton-guia');
    if (await guia.count()) {
      const cajaGuia = await guia.boundingBox();
      const cajaGuardar = await botonGuardar.boundingBox();
      if (cajaGuia && cajaGuardar) {
        const sePisan =
          cajaGuia.x < cajaGuardar.x + cajaGuardar.width &&
          cajaGuia.x + cajaGuia.width > cajaGuardar.x &&
          cajaGuia.y < cajaGuardar.y + cajaGuardar.height &&
          cajaGuia.y + cajaGuia.height > cajaGuardar.y;
        if (sePisan) errores.push('el botón de la guía tapa «Guardar versión editada»');
      }
    }

    // ── 7. El editor de video ────────────────────────────────────────────
    await page.goto(`http://localhost:3100/${PROYECTO}/editar/video`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Editar video' })).toBeVisible();
    await capturar(page, 'escritorio-10-editor-video');

    // Sin clip seleccionado, el panel se muestra con el aviso. Para llegar a
    // ese estado se hace clic en el fondo de la línea de tiempo.
    await page.locator('.est-track-row').first().click({ position: { x: 300, y: 10 } });
    const avisoClip = page.getByTestId('estudio-sin-clip');
    if (await avisoClip.count()) {
      await expect(avisoClip).toContainText('Selecciona un clip');
    } else {
      errores.push('el panel de clip no muestra el aviso «Selecciona un clip»');
    }

    // El export ofrece los dos formatos.
    await page.getByRole('button', { name: 'Exportar video' }).click();
    await expect(page.getByRole('button', { name: /MP4 \(H\.264\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /WebM \(VP9 \+ Opus\)/ })).toBeVisible();
    await capturar(page, 'escritorio-11-export-video');
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // ── 8. Flow: un solo botón externo, sin cuenta preseleccionada ───────
    await page.goto(`http://localhost:3100/${PROYECTO}/flow-ia`, { waitUntil: 'networkidle' });
    const botonesFlow = page.locator('[data-testid="flow-abrir"]');
    await expect(botonesFlow).toHaveCount(1);
    const enlaceFlow = await botonesFlow.getAttribute('href');
    if (!enlaceFlow) errores.push('el botón de Flow no tiene enlace');
    else if (/login_hint|[?&]Email=|&hd=/i.test(enlaceFlow)) {
      errores.push(`el enlace de Flow preselecciona cuenta: ${enlaceFlow}`);
    }
    await capturar(page, 'escritorio-12-flow');

    // ── 9. La auditoría ya no es un 404 ──────────────────────────────────
    const auditoria = await page.goto('http://localhost:3100/audit/wundeer', { waitUntil: 'domcontentloaded' });
    if ((auditoria?.status() ?? 0) >= 400) errores.push(`la auditoría responde HTTP ${auditoria?.status()}`);

    expect(errores, `botones o destinos que fallan:\n- ${errores.join('\n- ')}`).toEqual([]);
  });

  test('el recorrido en móvil (390×844)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await capturar(page, 'celular-01-portada');

    await page.goto('/login', { waitUntil: 'networkidle' });
    await capturar(page, 'celular-02-puerta');

    await page.getByRole('button', { name: /Escribir el código de WUNDEER/ }).click();
    await page.getByRole('button', { name: 'CONTINUAR' }).click();
    await page.getByRole('button', { name: 'ENTRAR' }).click();
    await page.waitForURL(new RegExp(`/${PROYECTO}`), { timeout: 15_000 });
    await capturar(page, 'celular-03-tablero');

    await page.goto(`http://localhost:3100/${PROYECTO}/material`, { waitUntil: 'networkidle' });
    await capturar(page, 'celular-04-material');

    await page.goto(`http://localhost:3100/${PROYECTO}/editar/foto`, { waitUntil: 'networkidle' });
    await capturar(page, 'celular-05-editor-foto');

    await page.goto(`http://localhost:3100/${PROYECTO}/editar/video`, { waitUntil: 'networkidle' });
    await capturar(page, 'celular-06-editor-video');

    await page.goto(`http://localhost:3100/${PROYECTO}/ideas/en-votacion`, { waitUntil: 'networkidle' });
    await capturar(page, 'celular-07-decisiones');
  });
});
