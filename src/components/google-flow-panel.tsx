'use client';

import { useState, useSyncExternalStore } from 'react';
import { Icon } from '@/components/ui/icons';
import {
  CLAVE_CORREO_FLOW,
  correoValido,
  urlAbrirFlow,
  urlCarpetaDrive,
} from '@/lib/google-flow';

const EVENTO_CORREO = 'rr-hub-flow-correo-change';

type Props = {
  /** `NEXT_PUBLIC_FLOW_DEFAULT_ACCOUNT`. Vacío abre el selector sin preselección. */
  cuentaRr: string;
  /** `NEXT_PUBLIC_FLOW_DRIVE_FOLDER_URL`. Vacío muestra el estado pendiente. */
  carpetaDrive: string;
  cliente: string;
};

function suscribirCorreo(callback: () => void) {
  window.addEventListener(EVENTO_CORREO, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENTO_CORREO, callback);
    window.removeEventListener('storage', callback);
  };
}

function leerCorreoGuardado(): string {
  try {
    return correoValido(window.localStorage.getItem(CLAVE_CORREO_FLOW)) ?? '';
  } catch {
    return '';
  }
}

function guardarCorreo(correo: string) {
  try {
    if (correo) window.localStorage.setItem(CLAVE_CORREO_FLOW, correo);
    else window.localStorage.removeItem(CLAVE_CORREO_FLOW);
  } catch {
    /* Sin almacenamiento el hub sigue abriendo Flow. */
  }
  window.dispatchEvent(new Event(EVENTO_CORREO));
}

const PASOS = [
  'Entra a Flow con la cuenta de RR o con la tuya. Cada quien usa su acceso.',
  'Crea la foto o el video en la pestaña de Flow. El hub no lo incrusta.',
  'Descarga el archivo desde Flow.',
  'Súbelo a la carpeta de Drive y nómbralo cliente_pieza_fecha.',
] as const;

const DEVOLVER = [
  'Descarga el archivo desde Flow.',
  'Súbelo a la carpeta de Drive.',
  'Nombra el archivo cliente_pieza_fecha.',
] as const;

export function GoogleFlowPanel({ cuentaRr, carpetaDrive, cliente }: Props) {
  const recordado = useSyncExternalStore(suscribirCorreo, leerCorreoGuardado, () => '');
  const [borrador, setBorrador] = useState<string | null>(null);
  const [error, setError] = useState('');
  const valor = borrador ?? recordado;
  const cuenta = correoValido(cuentaRr);
  const carpeta = urlCarpetaDrive(carpetaDrive);
  const enlaceRr = urlAbrirFlow(cuenta);
  const enlaceOtra = urlAbrirFlow(null);
  const enlaceRecordado = recordado ? urlAbrirFlow(recordado) : null;
  const ejemplo = `${cliente}_reel-lanzamiento_2026-11-09`;

  function recordar(texto: string) {
    const correo = correoValido(texto);
    if (texto.trim() && !correo) {
      setError('Escribe un correo válido. Solo el correo, nunca la contraseña.');
      return;
    }
    guardarCorreo(correo ?? '');
    setBorrador(null);
    setError('');
  }

  return (
    <div data-modulo="google-flow" className="mx-auto grid max-w-6xl gap-10 px-5 py-8 md:px-10 md:py-12">
      <header className="max-w-3xl">
        <p className="eyebrow text-blanco-70">RR Aliados · Google Flow · ruta A</p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-none tracking-tight text-blanco md:text-6xl">
          Flow · Fotos y video con IA
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-blanco-80 md:text-lg md:leading-8">
          Flow se abre en otra pestaña, con la cuenta que elija cada persona.
          Lo que se crea vuelve al hub por una carpeta de Drive. No hay una
          ventana de Flow dentro de esta página.
        </p>
      </header>

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
          Cada persona usa su propia cuenta o el grupo familiar de Google One de RR; no se comparten contraseñas. Los créditos de Flow son del plan de la cuenta que se use.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="abrir-flow" className="border border-blanco-20 border-l-4 border-l-fucsia p-5 md:p-6">
          <h2 id="abrir-flow" className="font-display text-2xl font-bold text-blanco">
            Abrir Flow
          </h2>
          <p className="mt-3 text-sm leading-6 text-blanco-70">
            El botón principal preselecciona la cuenta de RR cuando Dirección ya la dejó
            configurada. El otro abre el selector para elegir cualquier cuenta.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <a
              href={enlaceRr}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="flow-abrir-rr"
              className="btn-brutal inline-flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-normal px-4 text-center text-sm leading-snug text-balance sm:text-base"
            >
              <Icon name="spark" size={16} />
              Abrir Flow con la cuenta de RR
              <span className="sr-only">, se abre en una pestaña nueva</span>
            </a>
            {!cuenta && (
              <p className="text-sm leading-6 text-mostaza">
                La cuenta de RR todavía no está configurada. Este botón abre el selector sin
                correo preseleccionado.
              </p>
            )}
            <a
              href={enlaceOtra}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="flow-otra-cuenta"
              className="inline-flex min-h-[44px] w-full items-center justify-center border border-blanco-40 px-5 py-3 text-center font-display text-sm font-bold uppercase leading-snug tracking-tight text-blanco transition-colors hover:border-blanco hover:bg-blanco-05"
            >
              Usar otra cuenta
              <span className="sr-only">, se abre en una pestaña nueva sin preseleccionar correo</span>
            </a>
          </div>

          <div className="mt-6 border-t border-blanco-20 pt-5">
            <label htmlFor="correo-flow" className="font-display text-base font-bold text-blanco">
              Recordar mi correo en este navegador
            </label>
            <p id="ayuda-correo-flow" className="mt-2 text-sm leading-6 text-blanco-70">
              Opcional. Solo el correo, para no volver a buscarlo. Nunca la contraseña.
              Queda en este equipo y no se envía al hub.
            </p>
            <input
              id="correo-flow"
              name="correo"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              value={valor}
              data-testid="flow-correo"
              aria-describedby={error ? 'error-correo-flow ayuda-correo-flow' : 'ayuda-correo-flow'}
              aria-invalid={error ? true : undefined}
              placeholder="tu.correo@ejemplo.com"
              onChange={(event) => {
                setBorrador(event.target.value);
                if (error) setError('');
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                recordar(valor);
              }}
              className="input-brutal mt-3"
            />
            {error && (
              <p id="error-correo-flow" role="alert" className="mt-2 text-sm leading-6 text-mostaza">
                {error}
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button type="button" data-testid="flow-recordar" onClick={() => recordar(valor)} className="btn-ghost min-h-[44px] justify-center">
                Recordar este correo
              </button>
              {recordado && (
                <button
                  type="button"
                  data-testid="flow-olvidar"
                  onClick={() => recordar('')}
                  className="btn-ghost min-h-[44px] justify-center"
                >
                  Olvidar
                </button>
              )}
            </div>
            {recordado && (
              <p className="mt-3 text-sm leading-6 text-blanco-80" data-testid="flow-correo-recordado">
                Correo recordado en este navegador
                <span className="mt-1 block overflow-x-auto font-mono text-sm text-blanco">{recordado}</span>
              </p>
            )}
            {enlaceRecordado && (
              <a
                href={enlaceRecordado}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="flow-abrir-recordado"
                className="mt-3 inline-flex min-h-[44px] items-center font-mono text-xs text-mostaza underline-offset-4 hover:underline"
              >
                Abrir Flow con el correo recordado
                <span className="sr-only">, se abre en una pestaña nueva</span>
              </a>
            )}
          </div>
        </section>

        <section aria-labelledby="devolver-flow" className="border border-blanco-20 p-5 md:p-6">
          <h2 id="devolver-flow" className="font-display text-2xl font-bold text-blanco">
            Devolver al hub
          </h2>
          <p className="mt-3 text-sm leading-6 text-blanco-70">
            Flow no devuelve el archivo solo. Quien lo crea lo descarga y lo deja en la
            carpeta de Drive de este cliente.
          </p>
          <div className="mt-5">
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
          <ol className="mt-5 space-y-3">
            {DEVOLVER.map((paso, indice) => (
              <li key={paso} className="flex gap-3 text-sm leading-6 text-blanco-80">
                <span className="font-mono text-xs text-mostaza">{indice + 1}</span>
                <span>{paso}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 border border-blanco-20 px-4 py-3 font-mono text-xs leading-5 text-blanco-70">
            Ejemplo para {cliente}: <span className="text-blanco">{ejemplo}</span>
          </p>
        </section>
      </div>
    </div>
  );
}
