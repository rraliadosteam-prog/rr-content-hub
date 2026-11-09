/**
 * Lanzador de Google Flow (ruta A, aprobada el 8-nov-2026).
 *
 * Flow responde `X-Frame-Options: SAMEORIGIN` y no tiene API oficial, así que
 * el hub no lo incrusta ni habla con él. Solo arma dos enlaces públicos: el
 * selector de cuentas de Google y la carpeta de Drive donde vuelve el archivo.
 * Aquí no hay llaves, tokens ni contraseñas.
 *
 * DESDE 2026-11-09: EL HUB NO PRESELECCIONA NINGUNA CUENTA.
 *
 * Antes este archivo tenía `correoValido()`, la clave `CLAVE_CORREO_FLOW` y
 * una función que metía `Email=` en el AccountChooser, más `hd` y
 * `login_hint`. Todo eso salió por la misma razón: cada colaborador tiene que
 * entrar a Flow con SU correo personal, y la cuenta de empresa no existe.
 *
 * Quitar la preselección no es una mejora de estilo, es una corrección de
 * hechos:
 *
 *   - `Email=` hace que Google entre con ESA cuenta sin preguntar. Con la
 *     cuenta de RR, la persona acababa trabajando dentro de la cuenta de la
 *     empresa sin saberlo.
 *   - `hd=` y `login_hint=` PARTEN de una cuenta de empresa. Sin una cuenta de
 *     empresa real, son inventos: apuntan a un dominio que puede no existir.
 *   - El «recordar mi correo» en `localStorage` solo servía para volver a
 *     preseleccionar. Sin preselección no hay nada que recordar, así que se
 *     quitó el campo y con él el dato guardado en el equipo de cada persona.
 *
 * Lo que queda es un enlace que abre el selector de Google con Flow de
 * destino: cada quien elige su cuenta personal ahí, sin que el hub sepa cuál.
 */

export const FLOW_URL = 'https://flow.google.com/';

const SELECTOR_CUENTAS = 'https://accounts.google.com/AccountChooser';

/**
 * Selector de cuentas de Google con Flow como destino.
 *
 * SIN cuenta: a propósito. `continue` es lo único que se manda, así que
 * Google pregunta con qué cuenta se entra. Si algún día se vuelve a poner un
 * `Email=` aquí, la cuenta de empresa vuelve a impersonar a la persona.
 */
export function urlAbrirFlow(): string {
  const params = new URLSearchParams();
  params.set('continue', FLOW_URL);
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
