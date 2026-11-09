import Image from 'next/image';
import Link from 'next/link';

/**
 * Pie del hub: la firma de RR Aliados.
 *
 * Antes el logo solo vivía en la barra lateral, que en móvil está oculta tras
 * el botón de menú: en un teléfono de 390 px la única marca visible era el
 * nombre del proyecto en la cabecera. Aquí la firma es siempre visible y se
 * repite en cada scroll largo.
 *
 * Responsive:
 * - El texto largo ("Deployed by RR Aliados") se apila en móvil y va en línea
 *   desde `sm`; nunca se corta con puntos suspensivos ni se sale de la caja.
 * - **No hay botón de crear aquí a propósito.** Existe en la cabecera, y la
 *   regla de "una sola acción primaria por superficie" lo prohíbe duplicar: en
 *   `/wundeer` había 3 enlaces idénticos de crear y una de las rondas anteriores
 *   los quitó. Repetirlo en el pie hizo fallar 4 e2e, que es justo el detector
 *   que existe para esto. Quien llega al final de una ficha larga ya tiene el
 *   botón de la cabecera a un scroll de vuelta, y el enlace del pie a la
 *   cabecera no aporta: el logo y la firma son lo que faltaba.
 */
export function HubFooter({ slug, projectName }: { slug: string; projectName: string }) {
  return (
    /* MEDIDO 2026-10-04 con dedo real a 390 px: el boton flotante de la guia
       («?COMO SE USA?», `fixed bottom-3 left-3 z-40`, 44 px de alto) se posa
       ENCIMA de los dos primeros enlaces del pie, «TABLERO» y «BANCO DE IDEAS».
       Se ven, `getBoundingClientRect` los mide bien, y el dedo no llega:
       `elementFromPoint` devuelve el boton de la guia.

       Un boton flotante encima de contenido que se puede scrollear no es un bug
       de posicion: es que el contenido de abajo no sabe que el boton existe. Por
       eso el hueco se reserva AQUI, en el pie, y no moviendo el boton: al ser
       `fixed` no se va con la pagina, asi que quien tiene que ceder espacio es
       quien esta debajo.

       Y el segundo flotante, «INSTALAR EL HUB», abre un panel de
       `fixed bottom-14 right-4 w-[min(92vw,26rem)]` con 114 px de alto, que se
       come los TRES enlaces del pie.

       MEDIDO: el hueco va en `margin-bottom`, NO en `padding-bottom`. El panel
       del instalador es `fixed`: se posiciona respecto al VIEWPORT, no al flujo
       del pie. Un `padding-bottom` reserva espacio DENTRO de la caja, pero los
       enlaces se seguirían dibujando en el mismo sitio de la pantalla, debajo
       del panel. Con `mb-28` los enlaces suben 112 px y quedan por encima de
       los dos flotantes, que es lo que hace falta.

       En escritorio los dos flotantes se separan (`sm:bottom-4` el instalar y
       `sm:bottom-20` la guia) y el margen vuelve a `md:mb-8`. */
    <footer className="mt-16 border-t border-blanco-20 bg-negro px-4 pb-36 pt-8 sm:px-5 md:px-10 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/rr-symbol-fucsia-on-negro.png"
            alt="RR Aliados"
            width={40}
            height={31}
            className="h-8 w-auto shrink-0 object-contain"
          />
          <div className="min-w-0">
            <p className="font-display text-sm font-bold leading-tight text-blanco">
              Deployed by RR Aliados
            </p>
            <p className="mt-0.5 font-mono text-[10px] leading-4 text-blanco-50">
              Content Hub · {projectName.toUpperCase()}
            </p>
          </div>
        </div>

        <nav aria-label="Enlaces del pie" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href={`/${slug}`} className="inline-flex min-h-[44px] items-center font-mono text-[11px] text-blanco-60 underline-offset-4 transition-colors hover:text-blanco hover:underline">
            TABLERO
          </Link>
          <Link href={`/${slug}/ideas`} className="inline-flex min-h-[44px] items-center font-mono text-[11px] text-blanco-60 underline-offset-4 transition-colors hover:text-blanco hover:underline">
            BANCO DE IDEAS
          </Link>
          <Link href={`/${slug}/flow-ia`} className="inline-flex min-h-[44px] items-center font-mono text-[11px] text-blanco-60 underline-offset-4 transition-colors hover:text-blanco hover:underline">
            FLOW · IA
          </Link>
          <Link href={`/${slug}/material`} className="inline-flex min-h-[44px] items-center font-mono text-[11px] text-blanco-60 underline-offset-4 transition-colors hover:text-blanco hover:underline">
            MATERIAL
          </Link>
          <Link href={`/select-project`} className="inline-flex min-h-[44px] items-center font-mono text-[11px] text-blanco-60 underline-offset-4 transition-colors hover:text-blanco hover:underline">
            CAMBIAR DE PROYECTO
          </Link>
        </nav>
      </div>
    </footer>
  );
}
