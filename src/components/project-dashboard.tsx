import Link from 'next/link';
import { ProjectMap, type BoardIdea } from '@/components/project-map';
import { Chip } from '@/components/ui/chips';
import { Icon } from '@/components/ui/icons';
import { ROLE_LABEL, statusMeta, esTerminal, type RoleKey } from '@/lib/flow';
import { contarEsperas } from '@/lib/esperas';
import { QUEUES } from '@/lib/queues';
import { resumenProyecto, seccionesProyecto } from '@/lib/resumen-proyecto';
import { agruparPorPersona } from '@/lib/quien-tiene-la-pelota';
import { planPublicacionDe } from '@/lib/social-planning';

type Project = { name: string; client_name: string; description?: string | null };

// «Trabado» es exactamente lo que espera una decisión: la cola de aprobaciones.
// Sale de QUEUES (que a su vez deriva del motor de flujo) porque la regla del
// repo es que ninguna pantalla vuelva a escribir una lista de estados a mano.
const WAITING_STATUSES: readonly string[] = QUEUES.aprobaciones.statuses;

/**
 * Pantalla principal de un proyecto.
 *
 * Orden de lectura deliberado: quién eres y qué se puede hacer (cabecera) →
 * dónde está todo (mapa) → qué está trabado y por quién (panel de bloqueos).
 * El panel de bloqueos ya no es un número: son piezas concretas con su
 * responsable delante.
 */
export function ProjectDashboard({ project, projectSlug, ideas, role, responsables }: {
  project: Project;
  projectSlug: string;
  ideas: BoardIdea[];
  role: string;
  /** id de idea → nombre completo de quien la tiene. Ver `getResponsables`. */
  responsables?: Map<string, string | null>;
}) {
  /**
   * Lo que el equipo tiene pendiente, que NO es lo mismo que "paradas".
   *
   * `WAITING_STATUSES` es la cola de aprobaciones: espera a alguien de fuera. El
   * chip decía "N PIEZAS PARADAS" y ese número era 6 mientras 19 piezas más
   * esperaban una acción interna. La palabra "paradas" además accusesa mal: una
   * pieza esperando aprobación del cliente no está parada, está en manos de otro.
   *
   * La separación importa porque las dos cosas piden acciones distintas: una
   * exige un empujón del equipo, la otra una respuesta del cliente.
   * Presentarlas sumadas —o solo una— hace que el tablero diga una cosa y el
   * trabajo real sea otro.
   *
   * Ojo con `WAITING_STATUSES`: esa cola incluye `needs_changes`, que NO espera
   * al cliente — el cliente ya pidió cambios y le toca al equipo rehacerlo. Por
   * eso aquí se filtra aparte y va a la cuenta de abajo: son 3 piezas que el
   * tablero atributos al cliente y no lo son.
   */
  /*
   * MEDIDO 2026-10-01: estas dos líneas eran la causa de que el tablero se
   * contradijera en la misma pantalla. `esperandoEquipo` contaba
   * `!esTerminal(status)` —44 de 45— mientras `start-here.tsx` contaba solo
   * `QUEUES.aprobaciones.statuses` —6—. Las dos reglas eran correctas según su
   * propia definición, y por eso no se podían cruzar: nadie sabía cuál mandaba.
   *
   * Ahora las dos pantallas usan `contarEsperas` de `@/lib/esperas`. El número
   * grande de arriba (piezas abiertas) se llama `abiertas` a propósito: son
   * cosas distintas y no vuelven a aparecer como si fueran el mismo número.
   */
  const conteo = contarEsperas(ideas, esTerminal);
  const esperandoCliente = conteo.esperandoCliente;
  const esperandoEquipo = conteo.esperandoEquipo;
  /* MEDIDO 2026-10-06: antes estos dos agrupaban por ROL (`statusMeta().who`
     que devuelve «CLIENTE» o «EQUIPO»), no por persona. El panel derecho
     mostraba «CLIENTE · 1 PIEZA O6» y «EQUIPO · O32 · P30 · P29...»: códigos
     de pieza, no nombres. Ahora los dos paneles usan `personasCliente` y
     `personasEquipo`, que agrupan por `created_by` y resuelven el nombre
     completo. */
  const roleLabel = ROLE_LABEL[role as RoleKey] ?? role.toUpperCase();

  /* MEDIDO 2026-10-05: ver `resumen-proyecto.ts`. La ficha completa se puede
     abrir con un `<details>`, así que la cabecera no la tiene que cargar toda. */
  const resumenCliente = resumenProyecto(project.description);
  const tieneFichaLarga = seccionesProyecto(project.description) > 1;

  /*
   * MEDIDO 2026-10-05: el panel mostraba iniciales («C») y códigos («O6»). Con
   * 21 personas con acceso, eso no le dice a nadie a quién hay que empujar.
   *
   * `agruparPorPersona` usa el `created_by` de cada pieza. Las piezas SIN
   * responsable van a su propio grupo con la verdad de que están sin dueño: no
   * se cuelgan de la primera persona de la lista, que sería inventarle trabajo.
   */
  const porPersona = (lista: BoardIdea[]) =>
    agruparPorPersona(lista, responsables ?? new Map<string, string | null>());
  const personasCliente = porPersona(esperandoCliente);
  const personasEquipo = porPersona(esperandoEquipo);

  return (
    <main className="min-h-screen bg-negro">
      <div className="mx-auto max-w-[1440px] px-5 py-8 md:px-10 md:py-12">
        <header className="anim-rise mb-10 grid gap-8 border-b border-blanco-20 pb-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">[{project.name.toUpperCase()} · OPERACIÓN VIVA]</p>
            <h1 className="display-title">El trabajo visible.</h1>
            {/*
              MEDIDO 2026-10-05 (feedback de Santiago: «demasiado texto, y no se
              si el necesario»). Aquí se pintaba `project.description` entero:
              Wundeer, 4.108 caracteres, una caja de 672×1600 px dentro del
              proyecto. Mezclaba lo que hay que saber para trabajar con el
              historial de por qué se descartó cada referencia.

              Ahora va el resumen y, si hay ficha larga, un enlace para abrirla.
              `resumenProyecto` decide; acá no hay criterio de qué es importante.
              */}
            <div className="mt-6">
              <p className="line-clamp-6 max-w-2xl text-base leading-8 text-blanco-70">
                {resumenCliente || 'Cada pieza avanza de izquierda a derecha. El ícono, el color y el texto te dicen quién tiene la pelota.'}
              </p>
              {tieneFichaLarga && (
                <details className="mt-4 max-w-2xl">
                  <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center font-mono text-xs text-blanco-60 underline underline-offset-4 hover:text-blanco">
                    LEER LA FICHA COMPLETA ({seccionesProyecto(project.description)} secciones)
                  </summary>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-blanco-60">
                    {project.description}
                  </p>
                </details>
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Chip icon="user" tone="blanco">TU ROL: {roleLabel}</Chip>
              <Chip icon="pieces" tone="neutro">{ideas.length} PIEZAS EN EL HUB</Chip>
              {/* El número grande es "piezas", no "piezas esperando". Antes los
                  dos chips de abajo se leían como el mismo total y no lo eran:
                  44 contra 6. Ahora cada uno tiene su regla y su nombre. */}
              {/* El número que antes decía "PARADAS" era solo la espera externa.
                  Las dos cuentas van separadas porque son dos trabajos: una la
                  saca el cliente, la otra el equipo. */}
              <Chip icon="alert" tone="neutro">{esperandoCliente.length} ESPERANDO AL CLIENTE</Chip>
              <Chip icon="clock" tone="neutro">{esperandoEquipo.length} PARA QUE AVANCE EL EQUIPO</Chip>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {/* MEDIDO 2026-11-09: el botón de «Plan de publicación» salía en
                todos los clientes, y SÁTIRO y BOGA no tienen plan: el clic
                terminaba en un 404. Ahora solo se ofrece donde el plan
                existe, y la pantalla avisa si se llega por URL. */}
            {planPublicacionDe(projectSlug) ? (
              <Link href={`/${projectSlug}/redes`} className="btn-brutal inline-flex items-center gap-2">Plan de publicación <Icon name="publish" size={14} /></Link>
            ) : null}
            <Link href={`/${projectSlug}/ideas`} className="btn-brutal inline-flex items-center gap-2">VER TODO <Icon name="arrow" size={14} /></Link>
          </div>
        </header>

        <ProjectMap ideas={ideas} projectSlug={projectSlug} />

        <section className="mt-10 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          {/*
            MEDIDO 2026-10-05 (feedback de Santiago: «explica mejor esto, y en vez
            del numero deja los nombres de las personas»). El panel decía «1» en
            un número de 6xl y «C CLIENTE · 1 PIEZA O6»: la inicial de un rol, no
            de una persona, y el código de la pieza. Con 21 personas con acceso,
            un número grande no le dice a nadie a quién hay que escribirle.

            Ahora manda la persona: nombre con primer nombre y primer apellido,
            cuántas piezas tiene encima y cuáles. El número de piezas sigue
            estando, pero como dato de carga de la persona, no como titular.
            */}
          <div className="border border-blanco-20 bg-blanco-05 p-6 sm:p-8">
            <p className="eyebrow">[QUIÉN TIENE LA PELOTA]</p>

            {esperandoCliente.length === 0 && esperandoEquipo.length === 0 ? (
              <>
                <h2 className="mt-3 font-display text-2xl font-bold text-blanco">Nada está trabado.</h2>
                <p className="mt-3 text-sm leading-6 text-blanco-70">
                  Ninguna pieza espera una aprobación de alguien de fuera ni un empujón interno.
                  Todo lo que hay en el tablero se puede mover hoy mismo.
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-3 font-display text-2xl font-bold text-blanco">
                  {esperandoCliente.length > 0
                    ? `${esperandoCliente.length} esperando al cliente y ${esperandoEquipo.length} al equipo.`
                    : `${esperandoEquipo.length} esperando que el equipo las mueva.`}
                </h2>
                <p className="mt-3 text-sm leading-6 text-blanco-70">
                  {esperandoCliente.length > 0 && esperandoEquipo.length > 0
                    ? 'Son dos esperas distintas y piden cosas distintas: una la destraba el cliente, la otra alguien del equipo. Abajo está el nombre de quien tiene cada grupo encima.'
                    : esperandoCliente.length > 0
                      ? 'Estas piezas están en manos del cliente. Si no se mueven no es un fallo del hub: es una decisión que no ha llegado. Abajo está el nombre de a quién esperarle.'
                      : 'Estas no dependen de nadie de fuera: están listas para que alguien del equipo las empuje. Abajo está el nombre de quién las tiene.'}
                </p>
              </>
            )}

            {esperandoCliente.length > 0 && (
              <Link href={`/${projectSlug}/aprobaciones`} className="mt-5 inline-flex min-h-[44px] items-center gap-2 font-mono text-xs text-blanco-60 underline hover:text-blanco">
                VER DECISIONES <Icon name="arrow" size={13} />
              </Link>
            )}

            {personasCliente.length > 0 && (
              <div className="mt-7 border-t border-blanco-20 pt-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-orquidea">
                  ESPERANDO AL CLIENTE · {esperandoCliente.length} PIEZAS
                </p>
                <ul className="mt-3 space-y-3">
                  {personasCliente.map((persona) => (
                    <li key={persona.nombre} className="flex items-start gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold text-blanco">{persona.nombre}</p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-blanco-50">
                          {persona.total} {persona.total === 1 ? 'PIEZA' : 'PIEZAS'}
                        </p>
                        <p className="mt-1 font-display text-sm text-blanco-70">
                          {persona.piezas.join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {personasEquipo.length > 0 && (
              <div className="mt-7 border-t border-blanco-20 pt-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-orquidea">
                  ESPERANDO QUE EL EQUIPO LAS MUEVA · {esperandoEquipo.length} PIEZAS
                </p>
                <ul className="mt-3 space-y-3">
                  {personasEquipo.map((persona) => (
                    <li key={persona.nombre} className="flex items-start gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold text-blanco">{persona.nombre}</p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-blanco-50">
                          {persona.total} {persona.total === 1 ? 'PIEZA' : 'PIEZAS'}
                        </p>
                        <p className="mt-1 font-display text-sm text-blanco-70">
                          {persona.piezas.join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/*
            Este panel es el detalle por rol. Se queda, pero con los nombres:
            antes mostraba la inicial «C» como si fuera una persona.
            */}
          <div className="border border-blanco-20 p-5 sm:p-6">
            <p className="eyebrow">[QUÉ ESTÁ ESPERANDO Y POR QUÉ]</p>
            <p className="mt-3 text-sm leading-6 text-blanco-70">
              Una pieza en <span className="font-display font-bold text-blanco">votación</span> necesita
              votos del equipo. Una en <span className="font-display font-bold text-blanco">aprobación</span>{' '}
              necesita que el cliente la mire. Una en <span className="font-display font-bold text-blanco">cambios</span>{' '}
              vuelve al equipo para rehacerla. Ninguna está parada: cada una está esperando a alguien concreto.
            </p>

            {esperandoCliente.length ? (
              <div className="mt-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-blanco-50">
                  ESPERANDO AL CLIENTE · {esperandoCliente.length}
                </p>
                <ul className="mt-3 space-y-3">
                  {personasCliente.map((persona) => (
                    <li key={persona.nombre} className="flex items-start gap-3 border-b border-blanco-10 pb-3 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold text-blanco">{persona.nombre}</p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-blanco-50">
                          {persona.total} {persona.total === 1 ? 'PIEZA' : 'PIEZAS'}
                        </p>
                        <p className="mt-1 truncate font-display text-sm text-blanco-70">
                          {persona.piezas.join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-6 text-sm leading-6 text-blanco-60">Nadie espera al cliente: ninguna pieza depende hoy de una aprobación externa.</p>
            )}

            {esperandoEquipo.length > 0 && (
              <div className="mt-6 border-t border-blanco-20 pt-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-orquidea">
                  ESPERANDO QUE LAS MUEVA EL EQUIPO · {esperandoEquipo.length}
                </p>
                <ul className="mt-3 space-y-2">
                  {personasEquipo.map((persona) => (
                    <li key={persona.nombre} className="flex items-baseline gap-2">
                      <span className="shrink-0 font-display text-sm font-bold text-blanco">{persona.nombre}</span>
                      <span className="font-mono text-[10px] text-blanco-50">
                        {persona.total} {persona.total === 1 ? 'PIEZA' : 'PIEZAS'} · {persona.piezas.join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
