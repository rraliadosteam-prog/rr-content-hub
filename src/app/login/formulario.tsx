'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { entrarConCodigo, type ClienteConCodigo } from '@/lib/hub-client';
import { Icon } from '@/components/ui/icons';
import { destinoTrasEntrar } from '@/lib/destino-login';
import type { ClientePuerta } from '@/lib/puerta';

/**
 * La puerta del hub, en el navegador.
 *
 * MEDIDO 2026-11-09: `/login` era un «sin destino»: la spec v2 lo declaraba
 * inexistente y no había ni un enlace que lo llevara. Ahora es LA puerta: se
 * teclea el código del cliente, se elige el nombre y se entra. La cookie la
 * firma el servidor; aquí no hay ningún secreto.
 *
 * Los cuatro dígitos van en cuatro casillas porque es lo que se recuerda de
 * una puerta («Wundeer es 1111»), y pegarlos también funciona: el pegado se
 * reparte solo.
 */
export default function Formulario({ clientes }: { clientes: ClientePuerta[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [digitos, setDigitos] = useState(['', '', '', '']);
  const [cliente, setCliente] = useState<ClienteConCodigo | null>(null);
  const [personas, setPersonas] = useState<{ nombre: string; correo: string }[]>([]);
  const [elegido, setElegido] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  // Las cuatro casillas, para poder mover el foco al escribir o al pegar.
  const casillas = useRef<(HTMLInputElement | null)[]>([]);

  const codigo = digitos.join('');

  /** Un dígito por casilla. Si se pegan varios, se reparten uno a uno. */
  function poner(indice: number, valor: string) {
    const limpio = valor.replace(/\D/g, '');
    if (limpio.length > 1) {
      const nuevos = [...digitos];
      for (let i = 0; i < limpio.length && indice + i < 4; i += 1) {
        nuevos[indice + i] = limpio[i];
      }
      setDigitos(nuevos);
      // Pegado o tecleo rápido: el foco va a donde toca, para no tener que
      // tabular entre las cuatro casillas con el dedo.
      casillas.current[Math.min(indice + limpio.length, 3)]?.focus();
      return;
    }
    const nuevos = [...digitos];
    nuevos[indice] = limpio;
    setDigitos(nuevos);
    // Con el dígito puesto, se salta a la siguiente. Y si ya no queda ninguna,
    // el foco se queda en la última para que Enter sí sirva.
    if (limpio) casillas.current[Math.min(indice + 1, 3)]?.focus();
  }

  /** Backspace en una casilla vacía vuelve a la anterior y la borra. */
  function atras(indice: number) {
    const nuevos = [...digitos];
    if (digitos[indice] === '' && indice > 0) {
      nuevos[indice - 1] = '';
    } else {
      nuevos[indice] = '';
    }
    setDigitos(nuevos);
  }

  /**
   * Un clic y el código queda escrito. El botón NO entra: rellena. La persona
   * sigue eligiendo su nombre después, que es donde se decide qué puede hacer.
   */
  function rellenar(codigoCliente: string) {
    setDigitos(codigoCliente.split('').slice(0, 4));
    setError('');
    setCliente(null);
    setPersonas([]);
  }

  /** El código está completo: se mira qué cliente es. */
  async function buscarCliente() {
    if (codigo.length !== 4) {
      setError('Escribe los cuatro dígitos.');
      return;
    }
    setCargando(true);
    setError('');
    const resultado = await entrarConCodigo(codigo);
    setCargando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      setDigitos(['', '', '', '']);
      return;
    }
    if (!resultado.cliente) {
      setError('Ese código no abre ningún cliente. Pregúntale a Dirección cuál es.');
      setDigitos(['', '', '', '']);
      return;
    }
    if (resultado.personas.length === 0) {
      setError('Ese cliente todavía no tiene a nadie con acceso. Avísale a Dirección.');
      setDigitos(['', '', '', '']);
      return;
    }
    setCliente(resultado.cliente);
    setPersonas(resultado.personas);
    setElegido(resultado.personas[0]?.correo ?? '');
  }

  /** Cliente y persona: se entra. */
  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente || !elegido) {
      setError('Elige tu nombre.');
      return;
    }
    setCargando(true);
    setError('');
    const nombre = personas.find((p) => p.correo === elegido)?.nombre ?? '';
    const resultado = await entrarConCodigo(codigo, { correo: elegido, nombre });
    if (!resultado.ok) {
      setCargando(false);
      setError(resultado.error ?? 'No pudimos entrar.');
      return;
    }
    // MEDIDO 2026-10-01: el `next` es lo que hace que un link de idea sea
    // utilizable. Antes esta línea era siempre `/${cliente.slug}` y la persona
    // terminaba en el tablero, con la impresión de que el link estaba roto.
    router.push(destinoTrasEntrar(next, cliente.slug));
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      {/*
        La familia visual (Santiago, 2026-09-30). Esta puerta y la del Centro de
        Mando se tienen que reconocer: mismo logo, misma marca de RR, mismo
        negro. Lo que cambia es el cómo se entra — aquí un código de cuatro
        cifras y un nombre, allí Google — y eso no debe romper la familia.
      */}
      <p className="mb-8 flex items-center gap-2.5" aria-label="RR Aliados">
        <span aria-hidden="true" className="block h-6 w-6 bg-fucsia" />
        <span className="font-display text-sm font-bold tracking-[0.28em] text-blanco">RR ALIADOS</span>
      </p>

      <h1 className="font-display text-3xl font-bold text-blanco">Acceder al hub</h1>
      <p className="mt-3 text-sm leading-6 text-blanco-60">
        El código del cliente y tu nombre. Sin correos ni contraseñas.
      </p>

      {error && (
        <p role="alert" className="mt-6 border-l-2 border-mostaza bg-mostaza/10 px-4 py-3 text-sm leading-6 text-mostaza">
          {error}
        </p>
      )}

      {!cliente ? (
        <form onSubmit={(e) => { e.preventDefault(); buscarCliente(); }} className="mt-8">
          <fieldset>
            <legend className="mono-label block text-blanco-50">// CÓDIGO DEL CLIENTE</legend>
            <div className="mt-3 flex gap-2">
              {digitos.map((d, i) => (
                <input
                  key={i}
                  value={d}
                  onChange={(e) => poner(i, e.target.value)}
                  ref={(el) => { casillas.current[i] = el; }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace') { e.preventDefault(); atras(i); }
                  }}
                  onPaste={(e) => {
                    // Pegar el código entero tiene que funcionar: se reparte solo.
                    const pegado = e.clipboardData.getData('text').replace(/\D/g, '');
                    if (pegado.length > 1) {
                      e.preventDefault();
                      setDigitos(pegado.split('').slice(0, 4));
                      casillas.current[Math.min(pegado.length, 4) - 1]?.focus();
                    }
                  }}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  autoFocus={i === 0}
                  aria-label={`Dígito ${i + 1} de 4`}
                  className="h-16 w-full border border-blanco-30 bg-negro text-center font-display text-2xl text-blanco focus:border-blanco-60 focus:outline-none"
                />
              ))}
            </div>
          </fieldset>
          <button type="submit" disabled={cargando} className="btn-brutal mt-6 w-full disabled:opacity-50">
            {cargando ? 'BUSCANDO…' : 'CONTINUAR'}
          </button>
        </form>
      ) : (
        <form onSubmit={entrar} className="mt-8 space-y-5 anim-rise">
          <div className="brutal-panel">
            <p className="mono-label text-blanco-50">// CLIENTE</p>
            <p className="mt-1 font-display text-2xl font-bold text-blanco">{cliente.nombre}</p>
            <button
              type="button"
              onClick={() => { setCliente(null); setDigitos(['', '', '', '']); setPersonas([]); setError(''); }}
              className="mt-2 font-mono text-[10px] text-blanco-40 underline underline-offset-4 hover:text-blanco-70"
            >
              Cambiar el código
            </button>
          </div>

          <div>
            <label htmlFor="persona" className="mono-label block text-blanco-50">
              // QUIÉN ERES
            </label>
            <select
              id="persona"
              value={elegido}
              onChange={(e) => setElegido(e.target.value)}
              autoFocus
              className="input-brutal mt-2 w-full"
            >
              {personas.map((p) => (
                <option key={p.correo} value={p.correo}>{p.nombre}</option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-blanco-50">
              Tu rol en este cliente es el de siempre. Si no ves tu nombre, es que no tienes
              acceso todavía: dilo a Dirección.
            </p>
          </div>

          <button type="submit" disabled={cargando} className="btn-brutal w-full disabled:opacity-50">
            {cargando ? 'ENTRANDO…' : 'ENTRAR'}
          </button>
        </form>
      )}

      {!cliente && (
        /* Un botón por cliente y el código se escribe solo. El botón NO entra:
           rellena. El código dice de qué cliente entras, no quién eres, y eso se
           decide en el paso siguiente. */
        <div className="mt-12 border-t border-blanco-20 pt-6">
          <p className="mono-label text-blanco-50">// ¿A QUÉ CLIENTE ENTRAS?</p>
          {clientes.length === 0 ? (
            <p className="mt-3 border-l-4 border-l-mostaza bg-mostaza-05 px-4 py-3 text-sm leading-6 text-mostaza">
              Ahora mismo no hay ningún cliente con código de entrada. Pídeselo a Dirección.
            </p>
          ) : (
            <div className="mt-3 grid gap-px bg-blanco-10 sm:grid-cols-2">
              {clientes.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => rellenar(item.codigo)}
                  className="group flex items-center gap-3 bg-negro px-4 py-4 text-left transition-colors hover:bg-blanco-05"
                  aria-label={`Escribir el código de ${item.nombre}`}
                >
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 border border-blanco-40 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-xs tracking-[0.08em] text-blanco">
                      {item.nombre}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] text-blanco-50">
                      UN CLIC · ESCRIBE EL CÓDIGO
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-blanco-40">
                    <Icon name="arrow" size={14} />
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-blanco-50">
            El código abre el cliente. Lo que puedes hacer dentro lo decide tu rol, y ese
            no cambia con el código.
          </p>
        </div>
      )}

      {/* La salida que faltaba (Santiago, 2026-09-30): desde la puerta se puede
          volver a la portada. Antes esta pantalla no tenía ni un enlace y la
          PWA se quedaba «atascada en el login». */}
      <div className="mt-10 border-t border-blanco-10 pt-7">
        <p className="mono-label text-blanco-50">[¿NO ES TU CLIENTE?]</p>
        <Link href="/" className="btn-brutal mt-4 w-full">
          VOLVER A LA PORTADA
        </Link>
        <p className="mt-3 text-xs leading-5 text-blanco-50">
          Ver los proyectos de RR y entrar por otro cliente.
        </p>
      </div>
    </main>
  );
}

/**
 * Lo que se ve mientras el formulario resuelve.
 *
 * Va en este archivo y no en `page.tsx` porque es lo que Next necesita para
 * pintar mientras `useSearchParams` resuelve. Misma marca y mismo esqueleto
 * que la puerta: si esto se ve distinto al formulario, el salto de layout se
 * nota al entrar.
 */
export function PuertaEsqueleto() {
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <p className="mb-8 flex items-center gap-2.5" aria-label="RR Aliados">
        <span aria-hidden="true" className="block h-6 w-6 bg-fucsia" />
        <span className="font-display text-sm font-bold tracking-[0.28em] text-blanco">RR ALIADOS</span>
      </p>
      <h1 className="font-display text-3xl font-bold text-blanco">Acceder al hub</h1>
      <p className="mt-3 text-sm leading-6 text-blanco-60">Preparando la puerta…</p>
    </main>
  );
}
