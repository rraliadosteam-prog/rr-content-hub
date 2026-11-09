/**
 * Lanzador de Google Flow (ruta A, aprobada el 8-nov-2026).
 *
 * Flow responde `X-Frame-Options: SAMEORIGIN` y no tiene API oficial, así que
 * el hub no lo incrusta ni habla con él. Solo arma dos enlaces públicos: el
 * selector de cuentas de Google y la carpeta de Drive donde vuelve el archivo.
 * Aquí no hay llaves, tokens ni contraseñas.
 */

export const FLOW_URL = 'https://flow.google.com/';

/** Solo el correo, en este navegador. Nunca una contraseña ni un token. */
export const CLAVE_CORREO_FLOW = 'rr-hub-flow-correo-v1';

const SELECTOR_CUENTAS = 'https://accounts.google.com/AccountChooser';
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Correo usable en el selector. Vacío o inválido devuelve null. */
export function correoValido(valor: string | null | undefined): string | null {
  const limpio = valor?.trim() ?? '';
  if (!limpio || limpio.length > 254 || !CORREO.test(limpio)) return null;
  return limpio;
}

/**
 * Selector de Google con Flow como destino.
 * Si `cuenta` es un correo, se preselecciona con `Email`. Si no, el selector
 * abre sin cuenta.
 */
export function urlAbrirFlow(cuenta?: string | null): string {
  const params = new URLSearchParams();
  params.set('continue', FLOW_URL);
  const correo = correoValido(cuenta);
  if (correo) params.set('Email', correo);
  return `${SELECTOR_CUENTAS}?${params.toString()}`;
}

/**
 * Carpeta de Drive a la que el equipo devuelve el archivo.
 * Solo https de drive.google.com o docs.google.com. Cualquier otra cosa
 * (vacío, http, otro dominio) se trata como no configurada.
 */
export function urlCarpetaDrive(valor?: string | null): string | null {
  const limpio = valor?.trim() ?? '';
  if (!limpio) return null;
  let url: URL;
  try {
    url = new URL(limpio);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return null;
  return url.toString();
}
