import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3210';
const SALIDA = process.env.SALIDA ?? '/home/deadkiss/rr-encargos/2026-11-09_hub-flow/capturas';
mkdirSync(SALIDA, { recursive: true });

const VISTAS = [
  { nombre: 'escritorio', ancho: 1280, alto: 800, movil: false },
  { nombre: 'celular', ancho: 390, alto: 844, movil: true },
];

const navegador = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? undefined,
});

for (const vista of VISTAS) {
  const contexto = await navegador.newContext({
    viewport: { width: vista.ancho, height: vista.alto },
    deviceScaleFactor: 1,
    isMobile: vista.movil,
    hasTouch: vista.movil,
    locale: 'es-CO',
  });
  const pagina = await contexto.newPage();
  // La guía guiada sale en cada contexto nuevo y su overlay se come los
  // clics. Se marca como vista (mismo truco que el e2e del repo).
  await pagina.addInitScript(() => {
    try {
      window.localStorage.setItem('rr-hub-guia-v1', 'visto');
      window.localStorage.setItem('rr-hub:aviso-perfil-visto', '1');
    } catch {}
  });
  const errores = [];
  pagina.on('console', (mensaje) => {
    if (mensaje.type() === 'error') errores.push(mensaje.text());
  });
  pagina.on('pageerror', (fallo) => errores.push(String(fallo)));

  const captura = async (nombre) => {
    const ruta = `${SALIDA}/${vista.nombre}-${nombre}.png`;
    await pagina.screenshot({ path: ruta });
    console.log('captura', ruta);
  };

  const exigir = async (que, mensaje) => {
    const ok = await pagina.getByTestId(que).first().isVisible().catch(() => false);
    if (!ok) throw new Error(`FALTA ${que}: ${mensaje}`);
    console.log('  ok', que);
  };

  // 1. Flow
  await pagina.goto(`${BASE}/wundeer/flow-ia`, { waitUntil: 'networkidle' });
  await pagina.waitForTimeout(600);
  await exigir('flow-abrir', 'el botón único de Flow');
  await exigir('flow-aviso-fuera', 'el aviso de que se abre fuera del hub');
  await captura('01-flow-abrir');

  // 2. Material: elegir carpeta (modo ejemplo)
  await pagina.goto(`${BASE}/wundeer/material`, { waitUntil: 'networkidle' });
  await pagina.waitForTimeout(600);
  await exigir('material-aviso-todos', 'el aviso de que todos ven todo');
  await exigir('material-credenciales-pendiente', 'el estado pendiente de credenciales');
  await captura('02-material-inicio');

  await pagina.getByTestId('material-elegir-carpeta').click();
  await pagina.waitForTimeout(400);
  await exigir('material-carpetas-demo', 'el selector de carpetas de ejemplo');
  await captura('03-material-carpetas-ejemplo');

  await pagina.getByTestId('material-carpeta-demo-demo-carpeta-satiro').click();
  await pagina.waitForTimeout(900);
  await exigir('material-lista', 'la lista de archivos');
  await exigir('material-ajeno-demo-archivo-satiro-01', 'el aviso de archivo de otro cliente');
  await exigir('material-video-proximamente', 'el video como próximo');
  await captura('04-material-lista-otro-cliente');

  // 3. Editor de fotos
  await pagina.getByTestId('material-editar-demo-archivo-satiro-01').click();
  await pagina.waitForTimeout(1200);
  await exigir('editor-foto', 'el editor de fotos');
  await exigir('editor-lienzo', 'el lienzo con la foto');
  await pagina.getByTestId('editor-foto').scrollIntoViewIfNeeded();
  await pagina.waitForTimeout(400);
  await captura('05-material-editor-foto');

  // 4. Recorte 4:5 y guardar
  await pagina.getByTestId('editor-proporcion-4:5').click();
  await pagina.waitForTimeout(600);
  await pagina.getByTestId('editor-guardar').click();
  await pagina.waitForTimeout(1500);
  await captura('06-material-registrado');

  // 5. Entregar versión final
  const botonEntregar = pagina.locator('[data-testid^="material-entregar-"]').first();
  await botonEntregar.scrollIntoViewIfNeeded();
  await botonEntregar.click();
  await pagina.waitForTimeout(1500);
  const vence = await pagina.getByText(/Vence en/).first().isVisible().catch(() => false);
  if (!vence) throw new Error('No apareció el enlace firmado de entrega.');
  console.log('  ok enlace firmado con vencimiento');
  await pagina.locator('#material-entrega').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await pagina.waitForTimeout(400);
  await captura('07-material-entrega');

  // 6. Registro de auditoría
  await pagina.locator('#material-registro').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await pagina.waitForTimeout(400);
  await exigir('material-registro', 'el registro de auditoría');
  await captura('08-material-auditoria');

  if (errores.length) console.log('ERRORES DE CONSOLA', vista.nombre, errores.slice(0, 5));
  await contexto.close();
}

await navegador.close();
console.log('listo');
