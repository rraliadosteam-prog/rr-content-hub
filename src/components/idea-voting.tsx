'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { voteIdea, type VotoResultado } from '@/lib/workspace-client';
import { estadoVotacion, votosParaDecidir, VOTOS_NECESARIOS, type DecisionVoto } from '@/lib/flow';
import { Icon, type IconName } from '@/components/ui/icons';
import { emailElegido, esDelEquipo, perfilElegido, suscribirPerfil } from '@/lib/perfil-votante';
import { useVotosEnVivo } from '@/lib/use-votos-vivo';

/**
 * La decisión del equipo sobre una idea.
 *
 * MEDIDO 2026-11-09: este bloque se llamaba «Votación interna». El nombre viejo
 * prometía una votación y lo que hay es una decisión con motivo, versión y una
 * acción siguiente: la cola global (las «Decisiones del equipo») y esta tarjeta
 * son las dos puertas del mismo sitio.
 *
 * Lo que pidió Santiago: que en la ficha se vea cuántas votaciones lleva la idea
 * antes de subirla, y que el equipo pueda votar. Añadido el 2026-09-28: votar es
 * de alguien del equipo que ha entrado con su correo, no de un clic suelto.
 *
 * Decisiones que se tomaron y por qué:
 *
 * - **Solo el equipo, y solo activo.** El token del navegador sigue estando —es
 *   lo que impide que dos clics del mismo navegador cuenten como dos personas—
 *   pero ya no es identidad. La identidad es la sesión: su correo tiene que
 *   estar en la lista blanca del equipo y con la fila activa. Antes bastaba con
 *   inventar un token, y el conteo que decide si una pieza avanza al cliente lo
 *   podía falsear cualquiera que abriera la URL.
 *
 * - **Mayoría simple CON un mínimo de tres.** Santiago eligió mayoría simple el
 *   2026-09-28, y al medirla en producción salió el defecto: con "más sí que no"
 *   a secas, un solo voto a favor movía la pieza al cliente y quien pulsaba
 *   primero decidía por toda la casa. El 2026-09-29 añadió un mínimo de TRES
 *   votos, en los dos lados. Los números salen de `flow.ts`, no de aquí: si
 *   cambia el mínimo, esta pantalla lo dice solo.
 *
 * - **La pantalla dice cuántos votos faltan.** Un "1 a favor" a secas se lee como
 *   que va ganando, y no es así: es una votación incompleta. El número solo no
 *   informa de si decide o no.
 *
 * - **El contador se lee del servidor, nunca se acumula en local.** Si el
 *   navegador sumara, recargar la página bastaría para inflar la votación.
 *
 * - **Cuando la idea se mueve, el bloque desaparece solo.** Si ganó la votación,
 *   la idea ya no está en `voting` y los botones pierden sentido: aquí se
 *   muestra el resultado y nada más.
 */
export function IdeaVoting({
  ideaId,
  status,
  slug,
  equipo,
  inicial,
}: {
  ideaId: string;
  status: string;
  /** El cliente, para preguntar por sus votaciones en vivo. */
  slug: string;
  /** Las personas que pueden votar, para el selector de perfil. */
  equipo: { email: string; nombre: string }[];
  /** Conteo que llega del servidor al pintar la ficha. */
  inicial: { aFavor: number; enContra: number; detalle?: DecisionVoto[] };
}) {
  const router = useRouter();
  /**
   * MEDIDO 2026-10-03. El conteo venía de `useState(inicial)` y se quedaba en el
   * número que el servidor mandó al pintar. Votaba una persona y las demás
   * seguían viendo el viejo hasta recargar.
   *
   * Ahora el hook pregunta cada 10 s y solo repinta si el número cambió. Los
   * `setAFavor`/`setEnContra` de después de votar siguen existiendo para el
   * instante entre el clic y la siguiente pregunta: el voto propio se ve al
   * instante, sin esperar al siguiente turno del intervalo.
   */
  const { conteo, minimo: minimoVivo, hayCambio } = useVotosEnVivo(
    slug,
    ideaId,
    {
      aFavor: inicial.aFavor,
      enContra: inicial.enContra,
      cambios: inicial.detalle?.filter((d) => d === 'change').length ?? 0,
      total: inicial.aFavor + inicial.enContra,
      ultimo: null,
    },
  );

  const [aFavor, setAFavor] = useState<number | null>(null);
  const [enContra, setEnContra] = useState<number | null>(null);
  const [cambios, setCambios] = useState<number | null>(null);
  // La respuesta de cada persona, para pintar un emoji por persona en vez de un
  // número suelto. Llega del servidor; aquí no se cuenta nada.
  const [detalle, setDetalle] = useState<DecisionVoto[]>(inicial.detalle ?? []);
  // Qué acabas de pulsar tú, para el rebote. Se limpia solo: si el botón
  // siguiera rebotando para siempre, parecería que está seleccionado, y no es
  // un estado, es un eco de que se acaba de guardar.
  const [votoReciente, setVotoReciente] = useState<DecisionVoto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aviso, setAviso] = useState('');
  const [fallo, setFallo] = useState('');
  // El panel de "cambio" y el de "nota" son el mismo control con dos textos
  // distintos. Se abre con el botón y se cierra solo al responder.
  const [pidiendo, setPidiendo] = useState<'change' | 'note' | null>(null);
  const [texto, setTexto] = useState('');

  /**
   * El número que se PINTA. El voto propio manda sobre el del servidor: entre
   * que se pulsa y el siguiente turno del intervalo, este número es el nuevo y
   * el otro todavía es el viejo. Al revés se vería un rebote al número
   * anterior, que es peor que esperar diez segundos.
   */
  const aFavorPintado = aFavor ?? conteo.aFavor;
  const enContraPintado = enContra ?? conteo.enContra;
  const cambiosPintados = cambios ?? conteo.cambios;
  const total = aFavorPintado + enContraPintado;
  // La regla vive en el dominio: aquí solo se pinta lo que ya decidió. Si el
  // mínimo cambia en `flow.ts`, esta pantalla no se toca.
  const comoVa = estadoVotacion(aFavorPintado, enContraPintado);
  const faltan = votosParaDecidir(aFavorPintado, enContraPintado);

  // Solo hay algo que hacer en `voting`. En cualquier otro estado el bloque
  // informa, o desaparece si nunca hubo votación.
  const abierto = status === 'voting';
  /**
   * MEDIDO 2026-10-03: el perfil se elige en el navegador y se recuerda. Sin
   * perfil no se emite: es preferible un aviso a un voto que se pierde.
   *
   * `puedeVotar` se DERIVA, no se guarda en estado. Estaba en un `useEffect` con
   * `setState`, y el linter lo marcaba: setState síncrono dentro de un efecto
   * puede encadenar renders. Con `useSyncExternalStore` no hay estado que
   * sincronizar —el perfil elegido ES el estado— y el servidor lo comprueba
   * igual en cada voto, así que esto solo decide si el botón se explica o no.
   */
  const perfilActual = useSyncExternalStore(suscribirPerfil, perfilElegido, () => null);
  const puedeVotar = esDelEquipo(perfilActual?.email ?? '', equipo);

  const votar = useCallback(async (decision: DecisionVoto, nota = '') => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFallo('');
    setAviso('');

    const resultado: VotoResultado = await voteIdea(ideaId, decision, nota, emailElegido());
    setIsSubmitting(false);

    if (resultado.error) { setFallo(resultado.error); return; }

    setAFavor(resultado.aFavor ?? 0);
    setEnContra(resultado.enContra ?? 0);
    setCambios(resultado.cambiosPedidos ?? 0);
    setDetalle(resultado.detalle ?? []);
    setPidiendo(null);
    setTexto('');
    // El rebote dura 700 ms y luego se va: es la confirmación de que el servidor
    // guardó, no un estado que se pueda quedar puesto.
    setVotoReciente(decision);
    window.setTimeout(() => setVotoReciente(null), 700);

    // Lo que dice el servidor, no lo que el navegador supone. Antes, con un
    // voto a favor la respuesta decía "que se adelante" aunque la pieza ya
    // hubiera salido: el `gano` del cliente no miraba el mínimo de tres.
    if (resultado.votacion === 'ganada') {
      // La idea salió al cliente. Se avisa y se recarga para que la ficha entera
      // (estado, botón de siguiente paso) quede coherente: votar no refleja solo
      // un número, refleja un cambio de fase.
      setAviso('Aprobada. La idea ya pasó a revisión del cliente.');
      window.setTimeout(() => router.refresh(), 1400);
    } else if (resultado.votacion === 'perdida') {
      setAviso('La votacion se decidio en contra. La idea vuelve a revision interna.');
      window.setTimeout(() => router.refresh(), 1400);
    } else if (decision === 'change') {
      // El cambio pedido mueve la pieza aunque no haya mínimo. Y hay que decirlo
      // claro: no es que "quedan votos", es que alguien pidió tocar algo y la idea
      // vuelve a escribirse. Dejarlo como un "faltan 3" escondería lo que pasó.
      const cuantos = resultado.cambiosPedidos ?? 1;
      setAviso(
        `Tu cambio quedó pedido (${cuantos} en total). La idea vuelve a revisión interna `
        + `para aplicar lo que pediste.`,
      );
      window.setTimeout(() => router.refresh(), 2200);
    } else if (decision === 'note') {
      // La nota no cuenta ni frena: se dice eso mismo, para que nadie espere que
      // su nota haya movido nada.
      setAviso('Tu nota quedó con el equipo. No cuenta como voto ni detiene la votación.');
    } else {
      const faltanAhora = resultado.faltan ?? 1;
      setAviso(
        `Tu voto quedó registrado. Falta${faltanAhora === 1 ? '' : 'n'} ${faltanAhora} `
        + `voto${faltanAhora === 1 ? '' : 's'} para que la votación decida `
        + `(hacen falta ${VOTOS_NECESARIOS}).`,
      );
    }
  }, [ideaId, isSubmitting, router]);

  // Nunca votada y ya fuera de votación: no hay nada que contar y no hay nada
  // que hacer. Poner un "0 votos" en una pieza publicada sería ruido.
  if (!abierto && total === 0) return null;

  return (
    <div className="border border-blanco-20 p-5 anim-rise" data-guia="votacion">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        {/* MEDIDO 2026-11-09: el bloque de la ficha decía «VOTACIÓN INTERNA» y
            la barra decía «VOTACIÓN INTERNA», mientras la spec v2 pedía
            «Decisiones del equipo». Ahora los dos lados dicen lo mismo, y el
            bloque explica que hay motivo, versión y una acción siguiente. */}
        <p className="mono-label text-blanco-50">// DECISIÓN DEL EQUIPO</p>
        <p className="font-mono text-[10px] text-blanco-50">
          {total === 0 ? 'SIN VOTOS TODAVÍA' : `${total} ${total === 1 ? 'VOTO' : 'VOTOS'}`}
          {/* El número solo no dice si la votación decide. Con el mínimo de tres,
              "1 a favor" se leería como que va ganando y no es así: está
              incompleta. La línea de debajo dice si falta y cuánto. */}
          {abierto && comoVa === 'esperando' && total > 0 && (
            <span className="text-mostaza"> · FALTAN {faltan ?? 0}</span>
          )}
        </p>
      </div>

      {/* El contador va con palabras además de con cifras: si alguien no
          distingue fucsia de mostaza, "3 a favor / 1 en contra" sigue leyéndose. */}
      <div className="mt-4 flex items-baseline gap-5">
        <p className="font-display text-4xl font-bold text-orquidea">{aFavorPintado}</p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-blanco-50">
          a favor
          <br />
          <span className="text-blanco-40">sale si gana</span>
        </p>
        <p className="ml-auto font-display text-4xl font-bold text-blanco-40">{enContraPintado}</p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-blanco-50">
          en contra
          <br />
          <span className="text-blanco-40">deja la idea parada</span>
        </p>
      </div>

      {/* El voto reflejado: un emoji por persona, no un número suelto.
          Santiago, 2026-09-29: "cuando votas que sí, tu voto se va reflejado como
          un emoji de manito hacia arriba". Un "3" no dice si son tres pulgares o
          tres cambios pedidos; tres manos sí.

          Esto es lo que hace que "abrir la votación" no signifique "votar que sí":
          abrirla solo la muestra. El pulgar lo pone quien lo pulsa. */}
      {detalle.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Votos de cada persona">
          {detalle.map((d, i) => (
            <span
              key={`${d}-${i}`}
              className={`anim-voto ${TONO_EMOJI[d].clase}`}
              title={TONO_EMOJI[d].titulo}
              aria-label={TONO_EMOJI[d].titulo}
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <Icon name={TONO_EMOJI[d].icono} size={20} />
            </span>
          ))}
        </div>
      )}

      {abierto ? (
        <>
          <p className="mt-4 text-xs leading-5 text-blanco-60">
            Sale al cliente con más votos a favor que en contra, y hacen falta{' '}
            {minimoVivo} votos para que la votación decida. Puedes cambiar tu
            voto: el último vale.
          </p>

          {/* El cambio de otra persona, sin recargar. MEDIDO 2026-10-03: antes el
              número era el del servidor al pintar y se quedaba viejo. El aviso
              aparece solo si el número cambió de verdad, y se apaga solo. */}
          {hayCambio && (
            <p
              role="status"
              className="mt-3 border-l-4 border-l-orquidea bg-blanco-05 px-3 py-2 text-sm leading-6 text-blanco-80 anim-pop"
            >
              Alguien más acaba de votar. Ahora va {conteo.aFavor} a favor y{' '}
              {conteo.enContra} en contra.
            </p>
          )}

          {/* Las cuatro respuestas, con su icono. Santiago, 2026-09-29: "cuando
              votas que sí, tu voto se va reflejado como un emoji de manito hacia
              arriba". Antes había cuatro botones de texto en una fila y ningún
              icono; ahora cada respuesta tiene su mano y su sitio.

              Los colores no son decorativos: el pulgar arriba es orquídea (el
              equipo avanza), el pulgar abajo es blanco roto (no sale), el 6-7 es
              mostaza (pide un cambio) y la nota es gris (no cuenta). Que se
              distinguan sin leer es el objetivo. */}
          {/* MEDIDO 2026-10-03: quien entraba sin puerta veía el bloque entero
              como un cartel de SOLO LECTURA y no podía votar. El botón que se
              vé para los dos casos es el que explica: sin perfil no se puede
              emitir, y se dice por qué en vez de dejar un botón que falla. */}
          {!puedeVotar && (
            <p className="mt-4 border-l-4 border-l-mostaza bg-mostaza-05 px-3 py-2 text-sm leading-6 text-mostaza">
              Para votar, elige con qué perfil del equipo estás.emitiendo este
              voto. Está arriba a la derecha.
            </p>
          )}

          <div className="mt-4 grid gap-px bg-blanco-10 sm:grid-cols-2" aria-disabled={!puedeVotar}>
            <BotonVoto
              icono="pulgar-arriba"
              texto="SÍ, SALE"
              ayuda={`Tu sí. Hacen falta ${minimoVivo} para que decida.`}
              onClick={() => votar('yes')}
              enviado={isSubmitting}
              destacado={false}
              rebote={votoReciente === 'yes'}
            />
            <BotonVoto
              icono="pulgar-abajo"
              texto="NO"
              ayuda="No sale. No es lo mismo que pedir un cambio."
              onClick={() => votar('no')}
              enviado={isSubmitting}
              destacado={false}
              rebote={votoReciente === 'no'}
            />
            <BotonVoto
              icono="si-pero"
              texto="SÍ, PERO CÁMBIALE ALGO"
              ayuda="Ni sí ni no. Vuelve a revisión interna para aplicar tu cambio."
              onClick={() => { setPidiendo('change'); setTexto(''); }}
              enviado={isSubmitting}
              destacado={pidiendo === 'change'}
            />
            <BotonVoto
              icono="nota"
              texto="DEJAR UNA NOTA"
              ayuda="Aporta sin contar como voto ni detener la votación."
              onClick={() => { setPidiendo('note'); setTexto(''); }}
              enviado={isSubmitting}
              destacado={pidiendo === 'note'}
            />
          </div>

          {pidiendo && (
            <div className="mt-4 border border-mostaza-40 bg-mostaza-05 p-4 anim-rise">
              <label
                htmlFor="nota-votacion"
                className="mono-label block text-mostaza"
              >
                {pidiendo === 'change' ? '// QUÉ HAY QUE CAMBIAR' : '// TU NOTA PARA EL EQUIPO'}
              </label>
              <textarea
                id="nota-votacion"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={3}
                maxLength={800}
                autoFocus
                placeholder={
                  pidiendo === 'change'
                    ? 'Por ejemplo: el gancho está bien pero el formato no cabe en 15 segundos.'
                    : 'Lo que quieras que sepas, sin que esto pare la votación.'
                }
                className="mt-2 w-full resize-y border border-blanco-20 bg-negro p-3 text-sm leading-6 text-blanco placeholder:text-blanco-30 focus:border-mostaza focus:outline-none"
              />
              <p className="mt-2 font-mono text-[10px] leading-4 text-blanco-50">
                {pidiendo === 'change'
                  ? 'Con esto la idea vuelve a revisión interna para aplicar el cambio. No es un voto en contra: no la tira, la devuelve.'
                  : 'Esto no cuenta como voto ni detiene la votación. Solo lo lee el equipo.'}
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setPidiendo(null); setTexto(''); }}
                  disabled={isSubmitting}
                  className="btn-ghost"
                >
                  CANCELAR
                </button>
                <button
                  type="button"
                  onClick={() => void votar(pidiendo, texto)}
                  disabled={isSubmitting || texto.trim().length === 0}
                  className="btn-brutal inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? 'ENVIANDO…' : pidiendo === 'change' ? 'PEDIR EL CAMBIO' : 'ENVIAR LA NOTA'}
                </button>
              </div>
            </div>
          )}

          {cambiosPintados > 0 && !pidiendo && (
            <p className="mt-4 border-l-4 border-l-mostaza bg-mostaza-05 px-3 py-2 text-sm leading-6 text-mostaza">
              {cambiosPintados === 1
                ? 'Alguien pidió cambiar algo. La idea está en revisión interna hasta que se aplique.'
                : `${cambiosPintados} personas pidieron cambios. La idea está en revisión interna hasta que se apliquen.`}
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 font-mono text-[10px] text-blanco-50">
          VOTACIÓN {comoVa === 'ganada' ? 'GANADA' : comoVa === 'perdida' ? 'PERDIDA' : 'SIN DECIDIR'} ·{' '}
          {aFavorPintado} A FAVOR · {enContraPintado} EN CONTRA
        </p>
      )}

      {aviso && (
        <p id="aviso-votacion" role="status" className="mt-4 border-l-4 border-l-orquidea bg-blanco-05 px-3 py-2 text-sm leading-6 text-blanco-80 anim-pop">
          {aviso}
        </p>
      )}
      {fallo && (
        <p id="aviso-votacion-error" role="alert" className="mt-4 border-l-4 border-l-mostaza bg-blanco-05 px-3 py-2 text-sm leading-6 text-blanco-80 anim-pop">
          {fallo}
        </p>
      )}
    </div>
  );
}

/**
 * Qué emoji es cada respuesta, y de qué color.
 *
 * Los colores no son adorno: cada uno dice para qué sirve, y se distinguen sin
 * leer. Fucsia/orquídea es "el equipo avanza", blanco roto es "no sale", mostaza
 * es "pide un cambio" y el gris apagado es "no cuenta".
 *
 * El 6-7 con el chulito es la seña de "sí, pero". Es exactamente lo que hace la
 * respuesta `change`: no es un sí con reparos, es un "no así".
 */
const TONO_EMOJI: Record<DecisionVoto, { icono: IconName; clase: string; titulo: string }> = {
  yes: { icono: 'pulgar-arriba', clase: 'text-orquidea', titulo: 'Sí, que sale' },
  no: { icono: 'pulgar-abajo', clase: 'text-blanco-50', titulo: 'No' },
  change: { icono: 'si-pero', clase: 'text-mostaza', titulo: 'Sí, pero cámbiale algo' },
  note: { icono: 'nota', clase: 'text-blanco-30', titulo: 'Nota, no cuenta como voto' },
};

/**
 * Un botón de respuesta, con su mano.
 *
 * Antes los cuatro botones eran texto en una fila y no se distinguían sin leer.
 * Santiago, 2026-09-29: "cuando votas que sí, tu voto se va reflejado como un
 * emoji de manito hacia arriba" — y que se viera al instante, con rebote y
 * chispazo.
 *
 * El rebote no es adorno: es la confirmación de que el servidor ya guardó el
 * voto. Pasa al pulsar `votar`, cuando `votoReciente` es la misma respuesta.
 */
function BotonVoto({
  icono,
  texto,
  ayuda,
  onClick,
  enviado,
  destacado,
  rebote = false,
}: {
  icono: IconName;
  texto: string;
  ayuda: string;
  onClick: () => void;
  enviado: boolean;
  destacado: boolean;
  rebote?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={enviado}
      aria-pressed={destacado || rebote}
      className={`group flex items-start gap-3 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        destacado ? 'bg-blanco-10' : 'bg-negro hover:bg-blanco-05'
      }`}
    >
      <span
        className={`shrink-0 text-blanco-50 transition-colors group-hover:text-blanco ${rebote ? 'anim-voto anim-voto-chispa' : ''}`}
      >
        <Icon name={icono} size={26} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] tracking-[0.08em] text-blanco">{texto}</span>
        <span className="mt-1 block font-mono text-[10px] leading-4 text-blanco-50">{ayuda}</span>
      </span>
    </button>
  );
}
