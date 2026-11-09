'use client';

import { Icon } from '@/components/ui/icons';
import { urlAbrirFlow, urlCarpetaDrive } from '@/lib/google-flow';

type Props = {
  /** `NEXT_PUBLIC_FLOW_DRIVE_FOLDER_URL`. Vacío muestra el estado pendiente. */
  carpetaDrive: string;
  cliente: string;
};

const PASOS = [
  'Pulsa «Abrir Flow». Se abre una pestaña nueva, FUERA del hub.',
  'Entra con TU correo personal de Google. El hub no elige tu cuenta.',
  'Crea la foto o el video en esa pestaña. Flow no se incrusta aquí.',
  'Descarga el archivo y súbelo a la carpeta de Drive del material.',
] as const;

export function GoogleFlowPanel({ carpetaDrive, cliente }: Props) {
  const carpeta = urlCarpetaDrive(carpetaDrive);
  const enlace = urlAbrirFlow();
  const ejemplo = `${cliente}_reel-lanzamiento_2026-11-09`;

  return (
    <div data-modulo="google-flow" className="mx-auto grid max-w-6xl gap-10 px-5 py-8 md:px-10 md:py-12">
      <header className="max-w-3xl">
        <p className="eyebrow text-blanco-70">RR Aliados · Google Flow · ruta A</p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-none tracking-tight text-blanco md:text-6xl">
          Flow · Fotos y video con IA
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-blanco-80 md:text-lg md:leading-8">
          Flow se abre en otra pestaña y se usa con tu propia cuenta de Google.
          Lo que se crea vuelve al hub por la carpeta de Drive que elijas, y desde
          ahí se edita, se registra y se entrega.
        </p>
      </header>

      <section
        aria-labelledby="abrir-flow"
        className="border border-blanco-20 border-l-4 border-l-fucsia p-5 md:p-6"
      >
        <h2 id="abrir-flow" className="font-display text-2xl font-bold text-blanco">
          Abrir Flow
        </h2>

        <p
          role="note"
          data-testid="flow-aviso-fuera"
          className="mt-4 border-l-4 border-mostaza bg-mostaza-10 px-4 py-4 text-sm leading-6 text-blanco-80"
        >
          <strong className="text-mostaza">Ojo: se abre FUERA del hub.</strong> Flow se abre
          en una pestaña nueva de tu navegador y en esa pestaña trabajas con tu cuenta
          de Google. El hub no la ve, no la controla y no recibe el archivo solo: tú
          lo descargas y lo subes al material.
        </p>

        <div className="mt-5">
          <a
            href={enlace}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="flow-abrir"
            className="btn-brutal inline-flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-normal px-4 text-center text-sm leading-snug text-balance sm:text-base"
          >
            <Icon name="spark" size={16} />
            Abrir Flow
            <span className="sr-only">, se abre en una pestaña nueva fuera del hub</span>
          </a>
        </div>

        <p className="mt-4 text-sm leading-6 text-blanco-70">
          Al pulsar, Google te pregunta con qué cuenta entras. Elige la tuya, la
          personal:{' '}
          <strong className="text-blanco">el hub no preselecciona ninguna cuenta</strong> y
          no existe una cuenta de empresa compartida. Los créditos de Flow son los del
          plan de tu cuenta.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="guia-flow" className="border border-blanco-20 p-5 md:p-6">
          <h2 id="guia-flow" className="font-display text-2xl font-bold text-blanco">
            Cómo se usa
          </h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2">
            {PASOS.map((paso, indice) => (
              <li key={paso} className="flex gap-3 border border-blanco-20 bg-negro p-4">
                <span className="font-display text-2xl font-bold leading-none text-mostaza" aria-hidden>
                  {indice + 1}
                </span>
                <p className="text-sm leading-6 text-blanco-80">{paso}</p>
              </li>
            ))}
          </ol>
          <p
            role="note"
            className="mt-5 border-l-4 border-orquidea bg-blanco-05 px-4 py-4 text-sm leading-6 text-blanco-80"
          >
            Nunca se pide una contraseña en el hub, y las cuentas no se comparten. Lo
            único que queda guardado en este equipo es el material que tú mismo subes.
          </p>
        </section>

        <section aria-labelledby="devolver-flow" className="border border-blanco-20 p-5 md:p-6">
          <h2 id="devolver-flow" className="font-display text-2xl font-bold text-blanco">
            Devolver al hub
          </h2>
          <p className="mt-3 text-sm leading-6 text-blanco-70">
            Flow no devuelve el archivo solo. En <strong className="text-blanco">Material</strong>{' '}
            eliges la carpeta de Drive con el Google Picker, buscas, bajas, editas la
            foto y entregas la versión final con un enlace que vence.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            {carpeta ? (
              <a
                href={carpeta}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="flow-carpeta"
                className="btn-brutal inline-flex min-h-[44px] items-center justify-center gap-2"
              >
                <Icon name="upload" size={16} />
                Abrir la carpeta de Drive
                <span className="sr-only">, se abre en una pestaña nueva</span>
              </a>
            ) : (
              <p
                role="status"
                data-testid="flow-pendiente"
                className="border-l-4 border-mostaza bg-mostaza-10 px-4 py-4 text-sm leading-6 text-mostaza"
              >
                Pendiente: Dirección configura la carpeta de Drive
                {carpetaDrive.trim() ? (
                  <span className="mt-2 block text-blanco-80">
                    El enlace configurado no es una carpeta https de Drive.
                  </span>
                ) : null}
              </p>
            )}
          </div>
          <p className="mt-5 border border-blanco-20 px-4 py-3 font-mono text-xs leading-5 text-blanco-70">
            Ejemplo para {cliente}: <span className="text-blanco">{ejemplo}</span>
          </p>
        </section>
      </div>
    </div>
  );
}
