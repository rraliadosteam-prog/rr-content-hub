import type { ArchivoDrive } from '@/lib/drive';

/**
 * Material de ejemplo, para trabajar sin credenciales de Google.
 *
 * SIRVE PARA TRES COSAS, y las tres son honestas:
 *
 *  1. Poder probar el módulo entero (elegir carpeta, buscar, bajar, editar,
 *     registrar, entregar) sin tener una cuenta de Google a mano.
 *  2. Poder tomar las capturas de esta entrega.
 *  3. Poder ver el aviso de «este archivo es de otro cliente», que con
 *     archivos de un solo cliente no se vería nunca.
 *
 * Los nombres siguen la convención del equipo (`cliente_pieza_fecha`), que es
 * lo que permite saber de quién es cada archivo leyendo el nombre.
 *
 * Los identificadores tienen forma de id de Drive (letras, números, guion y
 * guion bajo) para que el código que los valida se ejercite de verdad.
 */

export const CARPETAS_DEMO: readonly { id: string; nombre: string }[] = [
  { id: 'demo-carpeta-wundeer', nombre: 'Wundeer · Material 2026' },
  { id: 'demo-carpeta-satiro', nombre: 'Sátiro · Material 2026' },
  { id: 'demo-carpeta-boga', nombre: 'BOGA · Material 2026' },
  { id: 'demo-carpeta-compartido', nombre: 'Compartido · Equipo RR' },
];

export const ARCHIVOS_DEMO: readonly ArchivoDrive[] = [
  {
    id: 'demo-archivo-wundeer-01',
    nombre: 'wundeer_reel-lanzamiento_2026-11-09.jpg',
    mimeType: 'image/jpeg',
    tamano: 2_418_176,
    esImagen: true,
    esVideo: false,
    carpetaId: 'demo-carpeta-wundeer',
    modificado: '2026-11-08T15:20:00.000Z',
    miniatura: null,
  },
  {
    id: 'demo-archivo-wundeer-02',
    nombre: 'wundeer_lookbook-detalle_2026-11-05.jpg',
    mimeType: 'image/jpeg',
    tamano: 1_884_160,
    esImagen: true,
    esVideo: false,
    carpetaId: 'demo-carpeta-wundeer',
    modificado: '2026-11-05T11:02:00.000Z',
    miniatura: null,
  },
  {
    id: 'demo-archivo-satiro-01',
    nombre: 'satiro_banner-carta_2026-11-07.png',
    mimeType: 'image/png',
    tamano: 921_600,
    esImagen: true,
    esVideo: false,
    carpetaId: 'demo-carpeta-satiro',
    modificado: '2026-11-07T09:45:00.000Z',
    miniatura: null,
  },
  {
    id: 'demo-archivo-satiro-02',
    nombre: 'satiro_video-cocina_2026-11-06.mp4',
    mimeType: 'video/mp4',
    tamano: 18_400_000,
    esImagen: false,
    esVideo: true,
    carpetaId: 'demo-carpeta-satiro',
    modificado: '2026-11-06T18:10:00.000Z',
    miniatura: null,
  },
  {
    id: 'demo-archivo-boga-01',
    nombre: 'boga_post-marca_2026-11-04.jpg',
    mimeType: 'image/jpeg',
    tamano: 3_102_464,
    esImagen: true,
    esVideo: false,
    carpetaId: 'demo-carpeta-boga',
    modificado: '2026-11-04T16:30:00.000Z',
    miniatura: null,
  },
  {
    id: 'demo-archivo-compartido-01',
    nombre: 'material_equipo-portada_2026-11-03.jpg',
    mimeType: 'image/jpeg',
    tamano: 1_258_291,
    esImagen: true,
    esVideo: false,
    carpetaId: 'demo-carpeta-compartido',
    modificado: '2026-11-03T10:00:00.000Z',
    miniatura: null,
  },
];

/** La cuenta de Google de ejemplo. */
export const CUENTA_GOOGLE_DEMO = { correo: 'persona.demo@ejemplo.com', nombre: 'Persona de ejemplo' };

/**
 * Un PNG de ejemplo, hecho con el canvas del navegador.
 *
 * No hace falta un archivo binario en el repo: el navegador puede pintar una
 * imagen de muestra en un canvas y de ahí sale un PNG de verdad. Así el editor
 * se puede probar sin descargar nada de Drive.
 */
export function pintarImagenDeEjemplo(
  canvas: HTMLCanvasElement,
  titulo: string,
  subtitulo: string,
): void {
  const ancho = 1080;
  const alto = 1350;
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const fondo = ctx.createLinearGradient(0, 0, ancho, alto);
  fondo.addColorStop(0, '#1b1b1b');
  fondo.addColorStop(0.55, '#2d2230');
  fondo.addColorStop(1, '#070001');
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ancho, alto);

  ctx.fillStyle = '#be076d';
  ctx.fillRect(0, 0, ancho, 18);

  ctx.strokeStyle = 'rgba(255,255,243,0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.arc(ancho / 2, alto / 2, 120 + i * 70, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = '#fffff3';
  ctx.font = '700 64px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(titulo, ancho / 2, alto / 2);

  ctx.fillStyle = '#ded116';
  ctx.font = '400 30px Helvetica, Arial, sans-serif';
  ctx.fillText(subtitulo, ancho / 2, alto / 2 + 60);

  ctx.fillStyle = 'rgba(255,255,243,0.7)';
  ctx.font = '400 24px Helvetica, Arial, sans-serif';
  ctx.fillText('MATERIAL DE EJEMPLO', ancho / 2, alto - 90);
}
