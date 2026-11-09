'use client';

/**
 * ¿Hay un editor abierto?
 *
 * MEDIDO 2026-11-09: el botón flotante «¿CÓMO SE USA?» tapaba el botón
 * «Guardar versión editada» del editor. Un botón que tapa el botón que hace
 * falta es un botón roto, por muy bienintencionado que sea.
 *
 * La solución no es esconder la guía para siempre: es que, mientras haya un
 * editor abierto, el botón flotante se aparte. La guía explica los botones del
 * HUB; el editor se explica solo, y su barra de acciones tiene que quedar
 * libre.
 *
 * El aviso se hace con un evento de ventana en vez de con una prop: el botón
 * flotante vive en el shell y los editores viven en páginas distintas, y no
 * hay un ancestro común al que colgarles.
 */

/** El evento que announces cuando se abre o se cierra un editor. */
export const EVENTO_EDITOR_ABIERTO = 'rr-hub:editor-abierto';

/** Avisa a toda la app de que hay un editor abierto (o de que se cerró). */
export function anunciarEditorAbierto(abierto: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO_EDITOR_ABIERTO, { detail: { abierto } }));
}
