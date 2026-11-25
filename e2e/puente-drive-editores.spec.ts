import { expect, test } from '@playwright/test';

/**
 * Prueba real del puente Drive -> editor -> Drive.
 * No usa Supabase ni credenciales: corre contra el servidor local en modo demo.
 * Arranca con: NEXT_PUBLIC_HUB_DEMO=true VERCEL_ENV=development npm run dev -- --port 3001
 */
test(' Drive -> RR Imagen -> nueva versión en la carpeta (demo)', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const hub = await contexto.newPage();
  await hub.goto('http://localhost:3001/wundeer/material');
  await expect(hub.getByRole('heading', { name: 'Archivos' })).toBeVisible();

  // Elegir la carpeta de ejemplo y contar los archivos antes de editar.
  await hub.getByTestId('material-elegir-carpeta').click();
  await hub.locator('[data-testid^="material-carpeta-demo-"]').first().click();
  await expect(hub.getByTestId('material-lista')).toBeVisible({ timeout: 15_000 });
  const antes = await hub.locator('[data-testid^="material-editar-"]').count();

  // Pulsar «Editar foto» abre el editor en otra pestaña y el hub sigue vivo.
  const botonEditar = hub.locator('[data-testid^="material-editar-"]').first();
  const [editor] = await Promise.all([
    hub.waitForEvent('popup'),
    botonEditar.click(),
  ]);
  await expect(hub.getByRole('heading', { name: 'Archivos' })).toBeVisible();
  expect(editor).toBeTruthy();
  await expect(editor.locator('canvas#photocraft_canvas')).toBeVisible({ timeout: 30_000 });

  // El editor devuelve bytes por el puente con el nonce que el hub le dio.
  const guardado = await editor.evaluate(() => {
    const nonce = window.name || '';
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    window.opener?.postMessage(
      {
        protocol: 'rr-editor-bridge', version: 1, type: 'rr-editor-ready',
        editor: 'rr-imagen', nonce, file: false,
      },
      location.origin,
    );
    window.opener?.postMessage(
      {
        protocol: 'rr-editor-bridge', version: 1, type: 'rr-editor-save',
        editor: 'rr-imagen', nonce,
        filename: 'prueba-drive.png', mime: 'image/png', bytes: bytes.buffer,
      },
      location.origin,
    );
    return nonce;
  });
  expect(guardado).toMatch(/^rr-editor-/);

  // El hub sube la versión nueva y la muestra sin sobrescribir el original.
  await expect.poll(async () => hub.locator('[data-testid^="material-editar-"]').count()).toBe(antes + 1);
  await expect(hub.getByTestId('material-lista').getByText('__rr-editado-').first()).toBeVisible({ timeout: 15_000 });
  await expect(hub.getByTestId('material-registro').getByText('__rr-editado-').first()).toBeVisible();
  await contexto.close();
});

test(' Drive -> RR Motion -> nueva versión en la carpeta (demo)', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const hub = await contexto.newPage();
  await hub.goto('http://localhost:3001/wundeer/material');
  await hub.getByTestId('material-elegir-carpeta').click();
  await hub.getByTestId('material-carpeta-demo-demo-carpeta-candilejas').click();
  await expect(hub.getByTestId('material-lista')).toBeVisible({ timeout: 15_000 });
  const antes = await hub.locator('[data-testid^="material-editar-video-"]').count();
  expect(antes).toBeGreaterThan(0);

  const [editor] = await Promise.all([
    hub.waitForEvent('popup'),
    hub.locator('[data-testid^="material-editar-video-"]').first().click(),
  ]);
  await expect(editor).toHaveURL(/\/editors\/rr-motion\/index\.html$/);

  const guardado = await editor.evaluate(() => {
    const nonce = window.name || '';
    const bytes = new Uint8Array([1, 2, 3, 4]);
    window.opener?.postMessage({ type: 'filmcraft:ready', version: '1', file: false, nonce, editor: 'rr-motion' }, location.origin);
    window.opener?.postMessage(
      { type: 'filmcraft:save', filename: 'prueba-motion.mp4', mime: 'video/mp4', bytes: bytes.buffer, nonce },
      location.origin,
    );
    return nonce;
  });
  expect(guardado).toMatch(/^rr-/);

  await expect.poll(async () => hub.locator('[data-testid^="material-editar-video-"]').count()).toBe(antes + 1);
  await expect(hub.getByTestId('material-lista').getByText('__rr-editado-').first()).toBeVisible({ timeout: 15_000 });
  await contexto.close();
});
