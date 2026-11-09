'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from './ui/icons';
import { reabrirAvisoDeInstalar } from './instalar-app';
import { EVENTO_EDITOR_ABIERTO } from '@/lib/editor-abierto';

/**
 * Modo guía.
 *
 * Por qué existe: medido el 2026-09-26, el tablero tenía **47 cosas clicables,
 * 47 etiquetas distintas, 33 encabezados y 822 palabras** en una sola pantalla,
 * y ninguna explicación al abrir. Un adulto ocupado se pierde; un niño o una
 * persona mayor, más.
 *
 * Esto no agrega funciones: agrega UNA. Un recuadro se posa sobre cada botón
 * importante y lo explica en español llano, con "siguiente" y "atrás". Se abre
 * solo la primera vez (queda en localStorage), y siempre se puede volver a
 * abrir con el botón flotante de abajo a la derecha.
 *
 * Reglas de estilo que respeta: esquinas duras, borde 2px, texto mono para las
 * etiquetas, y solo clases de animación que ya viven dentro de
 * `prefers-reduced-motion`.
 */
const CLAVE = 'rr-hub-guia-v1';

type Paso = {
  target: string;
  /**
   * MEDIDO 2026-10-04. En un celular el objetivo de escritorio puede estar
   * FUERA de la pantalla —la barra lateral vive en `x=-288`, escondida tras un
   * botón— y entonces el recuadro no tiene a quién posarse. MEDIDO en 390 px: el
   * paso 1 («Este es el menú») mide el `aside`, da `left=-288`, y el recuadro
   * no se pinta: la guía se lee sin ninguna marca.
   *
   * Con este campo, el paso dice dónde está lo mismo en el celular. Si no
   * existe, se usa `target` y queda como estaba.
   */
  targetMovil?: string;
  titulo: string;
  texto: string;
};

/** El tablero: de lo general a lo particular, en el orden en que se usa. */
const PASOS_TABLERO: Paso[] = [
  {
    target: 'aside',
    // MEDIDO 2026-10-04: en 390 px el `aside` está en x=-288, fuera de la
    // pantalla, así que el recuadro no tenía dónde posarse. En el celular lo que
    // se ve es el botón que la abre.
    targetMovil: 'button[aria-label="Menú principal"]',
    titulo: 'Este es el menú',
    texto: 'Está a la izquierda. Cada línea te lleva a una parte del hub. Nada de lo que toques aquí borra información: puedes tocar sin miedo.',
  },
  {
    // El botón de crear es condicional: un rol de solo lectura no lo ve, y la
    // guía no puede apuntar a algo que no existe para todo el mundo. El header
    // siempre está, así que la guía señala el sitio y el texto explica la regla.
    target: 'header',
    titulo: 'Aquí se crea una pieza',
    texto: 'El botón de la derecha suma una idea. Antes de entrar, el hub te pide lo que falta paso a paso. Si tu rol es de solo lectura, aquí verás "solo lectura" en vez del botón.',
  },
  {
    target: 'section[aria-label="Guía del flujo"]',
    titulo: 'Estos son los cuatro pasos',
    texto: 'Toda pieza hace el mismo recorrido: idea, guion, producción y publicado. El número grande dice cuántas piezas hay en cada paso. Si tocas un paso, abajo te quedan solo esas.',
  },
  {
    target: '.idea-card',
    titulo: 'Cada tarjeta es una pieza',
    texto: 'Arriba a la izquierda está su código: O1, P7. La franja de color del borde te dice de quién es el turno. Toca la tarjeta y se abre completa.',
  },
  {
    target: 'a[href$="/aprobaciones"]',
    titulo: 'Aquí ves lo que espera respuesta',
    texto: 'Si una pieza lleva días parada, aparece en esta lista. Es lo primero que conviene mirar cada día.',
  },
  {
    target: 'a[href$="/roadmap"]',
    titulo: 'Y aquí, el plan completo',
    texto: 'Cuánto falta para cerrar cada tramo del proyecto. Sirve para saber si vamos al día sin tener que preguntarle a nadie.',
  },
];

/** La ficha de una pieza. */
const PASOS_FICHA: Paso[] = [
  {
    target: 'main h1',
    titulo: 'Esta es tu pieza',
    texto: 'Arriba está el nombre y, al lado, en qué punto va. Las etiquetas de color te dicen si está completa o si le faltan datos.',
  },
  {
    target: '[data-guia="accion"]',
    titulo: 'Lo primero: qué hacer ahora',
    texto: 'Este recuadro dice quién tiene la pelota y te da el botón para mover la pieza. Si no te toca a ti, te lo dice y no te ofrece botones de más.',
  },
  {
    target: '[data-guia="brief"]',
    titulo: 'Esta es la referencia y su brief',
    texto: 'A la izquierda, el video real de la referencia. A la derecha, qué hay que copiar de ella: encuadre, talento, ritmo. El equipo trabaja con esto, no con el enlace suelto.',
  },
  {
    target: '[data-guia="comentarios"]',
    titulo: 'Y aquí se habla',
    texto: 'Cada decisión o duda queda escrita y la ven todos, desde cualquier computador. Nadie pierde el hilo en WhatsApp.',
  },
];

/** Las colas: lo que espera una decisión. */
const PASOS_COLA: Paso[] = [
  {
    target: 'main',
    titulo: 'Aquí está lo que no avanza solo',
    texto: 'Cada pieza de esta lista está esperando una respuesta de alguien. Están ordenadas por lo que más lleva parado: la de arriba es la más urgente.',
  },
  {
    target: 'a.idea-card',
    titulo: 'Toca una pieza para abrirla',
    texto: 'Se abre completa: qué falta, quién actúa y el botón para decidir. Con el botón de atrás del navegador vuelves a esta lista.',
  },
];

function pasosDe(ruta: string): Paso[] {
  if (/\/ideas\/[^/]+$/.test(ruta) && !ruta.endsWith('/nueva')) return PASOS_FICHA;
  if (/\/(aprobaciones|produccion|publicaciones)$/.test(ruta)) return PASOS_COLA;
  return PASOS_TABLERO;
}

export function GuidedTour() {
  const ruta = usePathname();
  const pasos = pasosDe(ruta ?? '');
  const [paso, setPaso] = useState<number | null>(null);
  const [caja, setCaja] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const reducido = useRef(false);

  /**
   * MEDIDO 2026-10-03. Santiago: «el apartado de como se usa, para celular esta
   * totalmente dañado». Y tenía razón, medido en cuatro anchos:
   *
   *   390x844   zona de texto   40 px de alto   (necesita 284)
   *            SIGUIENTE       top=1087        (289 px POR DEBAJO de la pantalla)
   *
   * La causa: la tarjeta se colocaba pegada al elemento resaltado, con
   * `top: caja.top + caja.height + 24`. En escritorio el elemento está arriba y
   * eso cabe. En un celular el elemento resaltado puede estar en y=600, el
   * `top` daba 664, y la tarjeta —con `max-h`— se quedaba con el alto mínimo del
   * contenido y el resto se iba debajo. Los botones, que van al final, nunca se
   * veían: el tour no tenía salida en el móvil.
   *
   * En móvil la tarjeta deja de ir pegada al objetivo y pasa a ser un panel de
   * pantalla completa con el texto en una zona que se baja y los botones FIJOS
   * abajo, siempre visibles. Que es como funciona un tutorial en un teléfono.
   */
  /**
   * Si el objetivo tiene algo que ver en pantalla.
   *
   * MEDIDO 2026-10-04: sin esto, el recuadro se pinta sobre una zona vacía cuando
   * el paso habla de un botón que está fuera del viewport. Un rectángulo flotando
   * en el negro no señala nada: hace creer que el botón está ahí.
   *
   * Con un margen de 20 px: si el botón asoma aunque sea un borde, el recuadro se
   * pega a esa esquina y sí orienta.
   */
  const visibleEn = useCallback((c: { top: number; left: number; width: number; height: number }): boolean => {
    if (typeof window === 'undefined') return false;
    // El estado guarda las cuatro aristas del origen, no `bottom`/`right`, así que
    // se calculan aquí. MEDIDO: con `c.bottom` sobre `undefined` toda comparación
    // da `false` y el recuadro NO se pinta nunca — el mismo bug, por otra vía.
    const abajo = c.top + c.height;
    const derecha = c.left + c.width;
    return c.top < window.innerHeight - 20
      && abajo > 20
      && c.left < window.innerWidth - 8
      && derecha > 8;
  }, []);

  const [movil, setMovil] = useState(false);
  useEffect(() => {
    const medir = () => setMovil(window.innerWidth < 768);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  /**
   * El selector del paso, segun el ancho.
   *
   * MEDIDO 2026-10-04: el paso 1 apunta al `aside`, que en 390 px está en
   * x=-288 —fuera de pantalla, porque la barra vive detrás de un botón—. El
   * paso se leía sin recuadro. Con `targetMovil` el mismo paso señala el botón,
   * que es lo que el usuario tiene delante.
   *
   * Se prueba el de móvil primero y, si no existe, el de escritorio: así el
   * paso no se salta en ninguno de los dos.
   */
  const selectorDe = useCallback((paso: Paso | undefined): string => {
    if (!paso) return '';
    if (movil && paso.targetMovil && document.querySelector(paso.targetMovil)) return paso.targetMovil;
    return paso.target;
  }, [movil]);

  // La primera visita abre la guía sola. Terminarla o saltarla la marca vista:
  // una guía que vuelve a saltar en cada pantalla deja de ser ayuda y pasa a
  // ser estorbo. El botón flotante siempre está para volver a abrirla.
  useEffect(() => {
    reducido.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      if (window.localStorage.getItem(CLAVE) !== 'visto') {
        const t = window.setTimeout(() => setPaso(0), 700);
        return () => window.clearTimeout(t);
      }
    } catch {
      /* sin localStorage, no se abre sola */
    }
  }, []);

  const medir = useCallback((indice: number) => {
    const objetivo = document.querySelector(selectorDe(pasos[indice]));
    if (!objetivo) {
      setCaja(null);
      return false;
    }
    const r = objetivo.getBoundingClientRect();
    setCaja({ top: r.top, left: r.left, width: r.width, height: r.height });
    return true;
  }, [pasos, selectorDe]);

  /** ¿Ya se ve entero? Entonces no movemos la página: moverla marea. */
  const yaSeVe = useCallback((objetivo: Element) => {
    const r = objetivo.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
  }, []);

  // Al cambiar de paso: traer el objetivo a la vista y medirlo. Si el objetivo
  // no existe en esta pantalla, el paso se salta solo. Todo el trabajo va
  // dentro del temporizador: el linter de React 19 rechaza (con razón) que un
  // efecto cambie estado en su propio cuerpo.
  useEffect(() => {
    if (paso === null) return;
    const t = window.setTimeout(() => {
      let n = paso;
      while (n < pasos.length && !document.querySelector(selectorDe(pasos[n]))) n += 1;

      if (n !== paso) {
        setPaso(n < pasos.length ? n : null);
        return;
      }

      const objetivo = document.querySelector(selectorDe(pasos[n]));
      if (!objetivo) return;
      if (!yaSeVe(objetivo)) {
        objetivo.scrollIntoView({ block: 'center', behavior: reducido.current ? 'auto' : 'smooth' });
        window.setTimeout(() => medir(n), reducido.current ? 0 : 300);
      } else {
        medir(n);
      }
      tarjeta.current?.focus({ preventScroll: true });
    }, reducido.current ? 0 : 80);
    return () => window.clearTimeout(t);
  }, [paso, pasos, medir, yaSeVe, selectorDe]);

  // El recuadro queda pegado al objetivo si la página se mueve.
  useEffect(() => {
    if (paso === null) return;
    const alMover = () => medir(paso);
    window.addEventListener('scroll', alMover, { passive: true });
    window.addEventListener('resize', alMover);
    return () => {
      window.removeEventListener('scroll', alMover);
      window.removeEventListener('resize', alMover);
    };
  }, [paso, medir]);

  const cerrar = useCallback(() => {
    try { window.localStorage.setItem(CLAVE, 'visto'); } catch { /* da igual */ }
    setPaso(null);
    setCaja(null);
  }, []);

  useEffect(() => {
    if (paso === null) return;
    const alTeclear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cerrar();
      if (event.key === 'ArrowRight') setPaso((n) => (n === null ? n : Math.min(n + 1, pasos.length - 1)));
      if (event.key === 'ArrowLeft') setPaso((n) => (n === null ? n : Math.max(n - 1, 0)));
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [paso, pasos.length, cerrar]);

  const abierto = paso !== null;
  const ultimo = paso === pasos.length - 1;

  /**
   * MEDIDO 2026-11-09: el botón flotante de la guía tapaba el botón
   * «Guardar versión editada» del editor de foto. Un botón de ayuda que tapa
   * el botón que hace falta es un botón roto.
   *
   * Mientras hay un editor abierto, este botón se aparta. La guía explica los
   * botones del HUB; el editor se explica solo, y su barra de acciones tiene
   * que quedar libre para poder guardar.
   */
  const [editorAbierto, setEditorAbierto] = useState(false);
  useEffect(() => {
    const alAbrir = (evento: Event) => {
      const detalle = (evento as CustomEvent<{ abierto?: boolean }>).detail;
      setEditorAbierto(Boolean(detalle?.abierto));
    };
    window.addEventListener(EVENTO_EDITOR_ABIERTO, alAbrir);
    return () => window.removeEventListener(EVENTO_EDITOR_ABIERTO, alAbrir);
  }, []);

  return (
    <>
      {/* Siempre disponible: la guía no se esconde después de la primera vez.

          En móvil el botón baja a la esquina y NO tapa el texto. Ser `fixed`
          encima del contenido se midió en 20 posiciones de scroll: con el texto
          completo tapaba entre 9 y 14 elementos en todas, y aun reducido al
          ícono seguía pisando el brief (`// INTENCIÓN` y su párrafo) porque
          ese bloque ocupa todo el ancho de la columna.

          Un botón flotante encima de texto de ancho completo no tiene arreglo
          por tamaño. Así que en móvil se le deja su propia franja: es un botón
          de ancho completo pegado abajo, fuera del flujo del texto, y la
          página reserva ese alto con `padding-bottom`. Se sigue viendo, se
          sigue tocando, y no pisa el brief.

          En escritorio sigue siendo el botón flotante de la esquina: ahí hay
          sitio de sobra y nunca estorba. */}
      {/* MEDIDO 2026-10-13: este botón y `AVISO INSTALAR` se cruzaban 12 px
          en escritorio: `bottom-20` dejaba la guía hasta y=820 y el aviso
          empezaba en y=808 sobre un viewport de 900 px. La guía sube a
          `sm:bottom-28`; en móvil conserva `bottom-20` porque el aviso está
          oculto allí. */}
      {!editorAbierto && (
        <button
          type="button"
          onClick={() => setPaso(0)}
          /* MEDIDO 2026-10-03: esto era `bottom-0 left-0 right-0 w-full h-12`, una
             barra que cruzaba la pantalla entera en el móvil y tapaba el borde
             inferior de la lista. En un teléfono un botón de ayuda va en su
             esquina, como en escritorio, y ocupa lo que ocupa. */
          className="fixed bottom-20 left-3 z-40 inline-flex min-h-[44px] items-center justify-center gap-2 border border-blanco-20 bg-negro px-3 font-mono text-xs text-blanco-70 transition-colors hover:bg-blanco-10 hover:text-blanco sm:bottom-28 sm:left-auto sm:right-4 sm:px-3 sm:py-2"
          aria-label="Abrir la guía: te explica cada botón"
          title="¿Cómo se usa?"
          data-testid="boton-guia"
        >
          <Icon name="eye" size={16} />
          <span>¿CÓMO SE USA?</span>
        </button>
      )}

      {/*
        MEDIDO 2026-10-05 (informe del tester): el aviso de instalar se guardaba
        en `sessionStorage` y voltaba en cada recarga, y la guia se leia como «un
        cuadro que bloquea la pagina». Con el aviso ahora respetado para siempre,
        hacia falta una vuelta atras sin obligar a nadie a limpiar el navegador.
        Este boton es esa vuelta atras, y vive junto al de la guia para no
        inventar una pantalla nueva.
      */}
      <button
        type="button"
        onClick={reabrirAvisoDeInstalar}
        className="fixed bottom-14 right-3 z-40 hidden h-9 items-center border border-blanco-20 bg-negro px-2.5 font-mono text-[10px] text-blanco-60 transition-colors hover:border-blanco-40 hover:text-blanco sm:flex"
        aria-label="Volver a mostrar el aviso de instalar en el iPhone"
      >
        <Icon name="upload" size={12} /> AVISO INSTALAR
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="guia-titulo">
          {/* El recuadro que se posa sobre el botón. La sombra gigante atenúa
              el resto lo justo para que el foco se lea, sin borrar la página:
              el objetivo es explicar lo que ya se ve, no taparlo.
              El `pointer-events-none` NO está en este div a propósito: sin él,
              el recuadro gigante se come los clics de toda la pantalla y el
              usuario queda encerrado en la guía. Por eso el overlay tampoco
              cierra al hacer clic fuera — cerrarlo sería un descuido. Lo que
              se puede es saltar, con Escape o el botón. */}
              {/* MEDIDO 2026-10-04. El recuadro AMARILLO es la seña de «este es
              el botón del que habla este paso», y en móvil no se pintaba: la
              condición era `caja && !movil`. MEDIDO: en 390 px salía `false`, o
              sea que se leían los pasos sin ninguna marca sobre el botón.

              Se quitó el 2026-10-03 con un motivo real: en móvil el panel es una
              hoja casi a pantalla completa y el objetivo queda fuera de vista, así
              que un borde de 300 px pegado a algo que no se ve es ruido. Eso
              sigue siendo cierto, y por eso la sombra gigante no vuelve a móvil:
              el recuadro regresa sin ella.

              Y se acota a lo que se ve: si el objetivo queda fuera del viewport no
              se pinta un rectángulo flotando en el vacío, porque eso no señala el
              botón — hace creer que está ahí. */}
          {caja && visibleEn(caja) && (
            <div
              aria-hidden="true"
              data-guia-recuadro="si"
              className="pointer-events-none fixed border-2 border-mostaza"
              style={{
                top: Math.max(4, Math.min(caja.top - 6, window.innerHeight - 20)),
                left: Math.max(4, Math.min(caja.left - 6, window.innerWidth - 12)),
                width: Math.min(caja.width + 12, window.innerWidth - 8),
                height: Math.min(caja.height + 12, window.innerHeight - 8),
                // La sombra gigante solo en escritorio: se come los clics de la
                // pantalla entera, y en un panel de móvil el recuadro ya está
                // encima de una hoja atenuada.
                boxShadow: movil ? 'none' : '0 0 0 9999px rgba(7,0,1,0.45)',
              }}
            />
          )}
          {!movil && !caja && <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-negro/45" />}

          <div
            ref={tarjeta}
            tabIndex={-1}
            className={`anim-pop fixed border border-blanco-30 bg-negro outline-none ${
              /* MEDIDO 2026-10-04. `flex flex-col` estaba en las clases BASE, y
                 una clase de la base compite con `inline-block` del ternario: al
                 calcular el ancho gana la base y el panel seguia siendo
                 `display: block`, o sea ocupaba todo el `max-w` (544 px) y el
                 texto se estiraba dentro. MEDIDO en vivo: `display: block` con
                 `width: 544px` y el texto a 502.

                 Y hay un segundo motivo para sacar el `display` de aqui: en
                 el CSS servido, `.flex` aparece ANTES que `.inline-flex`, asi
                 que el orden de las reglas —no el del className— decide. MEDIDO
                 en el CSSOM: el elemento llevaba `inline-flex` en la clase y
                 computaba `display: flex`. Pelearse con el orden de Tailwind es
                 perder; la columna la resuelve el HIJO, que es donde estan el
                 `flex-1` y el `shrink-0`.

                 Asi el panel es `inline-block` en las dos ramas y no hay
                 competencia con `.flex` —esa clase no existe ya en el panel—.
                 Mide lo que mide su contenido y nada mas. La columna la pone el
                 hijo unico, que es donde estan el `flex-1` y el `shrink-0`. */
              movil
                ? 'inline-block inset-x-3 top-3 max-h-[calc(100dvh-6.5rem)] rounded-none'
                /* MEDIDO 2026-10-03 a 1440x900: el popup daba 544x434, el 48% de
                   la altura de la pantalla, para un texto de tres líneas y 170
                   caracteres. Lo que se pide es que RODEE EL MENSAJE, no que
                   ocupe media pantalla. El ancho de lectura lo pone la zona
                   del texto, dos niveles más abajo. */
                : 'inline-block left-1/2 w-fit max-h-[calc(100dvh-2rem)] -translate-x-1/2 overflow-y-auto p-5 pt-14 sm:pt-14'
            }`}
            /*
             * MEDIDO 2026-10-01: esto estaba anclado con
             *   top: Math.min(caja.top + caja.height + 24, window.innerHeight - 220)
             * y el 220 era una suposición sobre lo que mide la tarjeta. Mide más:
             * título, texto y tres botones. Con el `top` ya calculado, los botones
             * caían por debajo del borde inferior (SALTAR en y=678 con una
             * ventana de 664) y el overlay, que no lleva `pointer-events-none`,
             * se comía el toque. La app entera quedaba bloqueada sin salida.
             *
             * Ahora: se da `top` Y `bottom`, y el navegador resuelve la
             * diferencia. La tarjeta nunca puede salirse de la ventana por abajo
             * porque su borde inferior está anclado a la ventana, no a un cálculo.
             * `max-h` + `overflow-y-auto` por si el texto es largo de verdad.
             * `dvh` y no `vh`: en iPhone la barra del navegador encoge el `vh`.
             */
            /* MEDIDO 2026-10-03 a 1440x900. El `bottom: 16` de aquí es lo que
               hace que la caja mida 544x434 — el 48% de la altura de la
               pantalla — para un texto de tres líneas. `top` Y `bottom` juntos
               son una orden de ESTIRAR: el navegador reparte el hueco que sobra
               entre los dos bordes, aunque el contenido no lo llene.

               El `bottom` estaba ahí para que la tarjeta no se saliera por abajo.
               Eso se consigue con `max-h`, que ya está en las clases, y no con un
               segundo borde que la estira. Ahora se ancla solo con `top` y la caja
               mide lo que mide el mensaje. El `top` sigue acotado a media
               pantalla: por muy abajo que esté el elemento resaltado, la tarjeta
               nunca arranca donde no queda sitio para ella, que era exactamente
               el corte del móvil. */
            style={movil || !caja || caja.top >= window.innerHeight / 2
              ? undefined
              : { top: Math.min(Math.max(16, caja.top + caja.height + 24), window.innerHeight / 2) }}
          >
            {/* MEDIDO 2026-10-03: en móvil el contenido se separa en dos. El texto
                se baja solo en una zona con `overflow-y-auto`, y los botones van
                FUERA de esa zona, fijos abajo. Antes todo iba en el mismo bloque
                scrolleable: los botones quedaban al final de un texto largo, es
                decir, fuera de la pantalla, y el tour no tenía salida.

                `flex-1 min-h-0` es lo que hace el reparto: sin `min-h-0` un
                hijo flexible no baja de su alto de contenido y el padre se
                desborda en lugar de dejar que el hijo se encoja. */}
            <div className={`flex min-h-0 flex-1 flex-col ${movil ? 'overflow-hidden' : ''}`}>
              {/* MEDIDO 2026-10-03 a 1440x900, con `w-fit` ya puesto. El ancho
                  seguía en 544 px: un bloque normal ocupa todo el ancho de su
                  padre, así que `w-fit` no tenía nada que encoger — el padre lo
                  declaraba 544 y el texto se estiraba a 502.

                  MEDIDO con `width: min-content`: el texto de este paso necesita
                  98 px. De los 502 que tenía. `inline-block` + `w-full` deja que
                  la caja mida lo que mide su contenido en vez de heredarlo, y en
                  móvil conserva el ancho completo.

                  OJO: este comentario va entre llaves y asteriscos. Entre dos
                  etiquetas JSX, un asterisco doble SIN las llaves es texto
                  suelto: sale pintado en pantalla dentro del tour. Pasó, y se
                  vio el comentario entero en el popup de todos los usuarios. */}
              {/* MEDIDO 2026-10-04 con Playwright en Chromium, quitando un hijo
                  cada vez del popup ya desplegado:

                      sin el <p> del cuerpo    panel  236 px
                      sin el <h2>              panel  667 px

                  El ancho no lo fijaba el padre: lo fijaba el parrafo, cuyo
                  `min-content` son 625 px. Y `fit-content` no podia servir, porque
                  es el ancho del contenido PARTIDO para que quepa en el espacio
                  disponible — y ese espacio se lo daba el padre. Circular.

                  Lo que funciona es un tope de ancho de LECTURA. MEDIDO todo el
                  rango:

                      38 rem  panel 792 px  2 lineas
                      32 rem  panel 554 px  2 lineas
                      28 rem  panel 490 px  2 lineas   <- este
                      24 rem  panel 426 px  3 lineas

                  28 rem es donde el texto sigue en dos lineas y la caja deja de
                  medir lo que media el padre.

                  Y va como `max-w`, no como `width`. MEDIDO: con
                  `width: min(28rem, 100%)` el panel daba 769 px — el `width`
                  compite con el `flex-1` de la columna y el padre lo estiraba—;
                  con `max-w: 28rem` da 490. La diferencia entre las dos es que
                  `width` es una orden y `max-w` es un tope.

                  En movil manda el `w-full`, que es lo correcto ahi: ahi si se
                  quiere la pantalla entera. */}
              <div className={
                movil
                  ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1'
                  : 'min-w-0 max-w-[28rem]'
              }>
            {/*
              MEDIDO 2026-10-05 (informe del tester, PC y móvil): la guía salía
              como «un cuadro que bloquea la página». Tenia salida —`SALTAR`, Escape
              y `YA ENTENDÍ`— pero los tres estaban ABAJO, y el paso 1 de 6 mide
              490x270 en escritorio: en un iPhone el botón de saltar queda por
              debajo del pliegue de la tarjeta y quien entra no ve que hay salida.
              El resultado es una pantalla que parece rota y una app bloqueada.

              La salida va arriba, a la derecha, donde el ojo ya está: una X
              grande. Es la convención que cualquiera reconoce sin instrucción, y
              no depende de descubrir el texto. Los botones de abajo siguen
              estando para quien prefiera recorrer la guía entera.
            */}
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar la guía"
              className="absolute right-3 top-3 flex h-11 w-11 shrink-0 items-center justify-center border border-blanco-30 bg-negro text-blanco-70 transition-colors hover:border-blanco-60 hover:text-blanco"
            >
              <Icon name="close" size={18} />
            </button>
                <p className="font-mono text-[11px] tracking-[0.1em] text-blanco-60 sm:text-xs sm:text-blanco-50">
                  PASO {paso! + 1} DE {pasos.length}
                </p>
                <h2 id="guia-titulo" className="mt-2 font-display text-2xl font-bold leading-tight text-blanco">
                  {pasos[paso!].titulo}
                </h2>
                <p className="mt-3 text-[15px] leading-7 text-blanco-80 sm:text-lg sm:leading-8">{pasos[paso!].texto}</p>
              </div>

              {/* MEDIDO 2026-10-04 a 1440x900: con el tope de lectura puesto, el
                  texto baja a 448 px pero el panel se queda en 633. Lo que lo
                  estiraba era ESTA fila: un `flex` con el ancho del padre, y el
                  padre —la columna con `flex-1`— hereda el ancho del panel. Los
                  botones miden 147 y 73 px de verdad, pero la fila medía 591.

                  `w-fit` en la fila: mide lo que ocupan los botones y nada mas.
                  El `flex-wrap` se queda, porque en un ancho chico los botones
                  se pasan a dos lineas. */}
              <div className={`flex w-fit flex-wrap items-center gap-3 ${
                movil
                  ? 'shrink-0 border-t border-blanco-20 bg-negro pt-3 pb-1'
                  : 'mt-5'
              }`}>
              {paso! > 0 && (
                <button
                  type="button"
                  onClick={() => setPaso((n) => Math.max(0, (n ?? 0) - 1))}
                  className="inline-flex min-h-[44px] items-center gap-2 border border-blanco-20 px-3 py-2 font-mono text-xs text-blanco-60 transition-colors hover:border-blanco-40 hover:text-blanco"
                >
                  ← ATRÁS
                </button>
              )}
              <button
                type="button"
                onClick={() => (ultimo ? cerrar() : setPaso((n) => (n ?? 0) + 1))}
                className="btn-brutal inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 sm:flex-none"
              >
                {ultimo ? 'YA ENTENDÍ' : 'SIGUIENTE'} <Icon name="arrow" size={14} />
              </button>
              {/* MEDIDO: este botón medía 16px de alto. En un dedo no se
                  pincha, y era la única salida del tour en un iPhone. Mínimo
                  táctil de 44px, como el resto de la app. */}
              <button
                type="button"
                onClick={cerrar}
                className="inline-flex min-h-[44px] items-center px-3 font-mono text-xs text-blanco-60 underline transition-colors hover:text-blanco"
              >
                {ultimo ? 'CERRAR' : 'SALTAR'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
