import Link from 'next/link';
import { quienEs } from '@/lib/quien-es';
import { getIdeas, getClientesDeLaPersona } from '@/lib/data';
import { statusMeta, type WorkflowStatus } from '@/lib/flow';
import { BOARD_COLUMNS } from '@/lib/queues';
import { Icon } from '@/components/ui/icons';
import { resumenProyecto, seccionesProyecto } from '@/lib/resumen-proyecto';

/**
 * MEDIDO 2026-10-03. La puerta de entrada del hub.
 *
 * Antes esta página hacía `firstProject(projects)`: cogía el PRIMER proyecto de
 * la lista y lo pintaba como "PROYECTO ACTIVO", sin menciona que había otros.
 * MEDIDO: una persona con Wundeer y Candilejas abiertos entrando con la sesión de
 * Candilejas veía solo Candilejas, y el selector del menú lateral showed Wundeer
 * repetido. La página respondía "ya estás dentro" sin decir de qué se trata ni
 * dejar elegir. Eso es justo lo que hace inservible una portada: se entra a ciegas.
 *
 * Ahora hace las dos cosas que una portada tiene que hacer:
 *
 * 1. Explicar qué es esto, en una frase y con el flujo a la vista.
 * 2. Dejar elegir proyecto, con el conteo REAL de cada uno al lado. Si solo
 *    tienes un cliente, ese queda destacado; si tienes varios, todos se ven.
 *
 * No se redirige a un cliente "por defecto": elegir es una decisión de quien
 * entra, y meterla automática es lo que escondía el otro.
 */
const FASES = [
  { icono: 'spark' as const, nombre: 'LA IDEA', texto: 'Se propone con su brief y se decide en equipo.' },
  { icono: 'pen' as const, nombre: 'EL GUION', texto: 'Se escribe el plan y se aprueba antes de grabar.' },
  { icono: 'camera' as const, nombre: 'LA PRODUCCIÓN', texto: 'Rodaje, crudo y montaje. Cada archivo con su versión.' },
  { icono: 'publish' as const, nombre: 'LA SALIDA', texto: 'Se publica, se registra la evidencia y se cierra.' },
];

export default async function Home() {
  const sesion = await quienEs();

  // MEDIDO 2026-10-03. Sin sesión esta página NO inventa nada ni culpa a la base.
  //
  // El fallo del 2026-09-29: la raíz pedía los proyectos ANTES de mirar si había
  // cookie, así que sin sesión salía "Sin proyectos disponibles" y culpaba a
  // Supabase. Era mentira en dos partes.
  //
  // Y una tentación nueva: contar con `getClientesDeLaPersona` sin sesión da
  // `abiertos: []`, que haría pintar "todavía no tienes un cliente abierto" a
  // quien solo no se ha loggedeado todavía. Tampoco es verdad, y esconde la
  // puerta. Sin sesión se va al login, que es donde se teclea el código.
  // SIN PUERTA (2026-10-02). Este `redirect('/login')` venía de la portada de
  // `main`, escrita cuando había un código de cuatro cifras. Con la puerta caída
  // era un 404 para todo el mundo: `/` no llevaba a nada.
  //
  // Ahora, sin sesión, se listan los clientes abiertos (o sea, todos, que es el
  // punto) y se deja elegir. La portada de `main` es mejor que la que había
  // antes: explica de qué va y deja elegir con el conteo real al lado. Se queda
  // esa y se le quita solo esto.


  const { abiertos, cerrados } = await getClientesDeLaPersona();
  // `sesion.proyecto` es el cliente de la cookie (el código con el que entraste).
  // La portada NO decide a cuál se entra: el que ya tienes abierto sale
  // destacado y arriba del todo, con su botón. Cambiar de cliente es otra acción.
  // MEDIDO 2026-10-03: `quienEs()` devuelve `{email, nombre, proyecto}`. No hay
  // un campo `sesion.actual`: ese nombre venía de la idea, no de la base, y no
  // compilaba. Aquí `sesionActual` es el slug del cliente con el que se entró.
  const sesionActual = sesion?.proyecto || null;

  // Con sesión pero sin ningún cliente: se dice aquí, en la propia página, con lo
  // que sí se sabe. Un rebote a una pantalla que no existe es un 404.
  if (abiertos.length === 0) {
    return <main className="grid min-h-screen place-items-center bg-negro px-5 py-20">
      <div className="w-full max-w-2xl border border-blanco-20 p-8 anim-rise">
        <p className="eyebrow">[RR CONTENT HUB]</p>
        <h1 className="mt-4 font-display text-4xl font-bold text-blanco">
          {cerrados.length > 0 ? 'Todavía no tienes un cliente abierto.' : 'Todavía no hay clientes.'}
        </h1>
        <p className="mt-5 text-sm leading-7 text-blanco-60">
          {cerrados.length > 0
            ? 'Tu correo está en la lista, pero ninguno de esos clientes tiene código de entrada. Pídeselo a quien administra el hub.'
            : 'El hub está abierto y la base responde, pero no hay ningún cliente dado de alta. Cuando se cree el primero, aparece aquí.'}
        </p>
      </div>
    </main>;
  }

  // MEDIDO 2026-10-03: el conteo se pide por proyecto y en paralelo. Antes solo
  // se cargaba el primero, así que los demás salían sin cifra y no había forma de
  // saber si estaban vacíos o solo no se miraban. `abiertos` ya trae el `id` del
  // proyecto: no hace falta una consulta extra por cliente solo para esto.
  const conConteo = await Promise.all(
    abiertos.map(async (cliente) => ({ cliente, ideas: await getIdeas(cliente.id) })),
  );
  // El que ya tienes abierto va primero. No se elige por la persona: se ordena
  // para que no tenga que buscarlo. La decisión sigue siendo suya.
  conConteo.sort((a, b) => Number(b.cliente.slug === sesionActual) - Number(a.cliente.slug === sesionActual));

  const totalPiezas = conConteo.reduce((a, x) => a + x.ideas.length, 0);
  const esperando = conConteo.reduce(
    (a, x) => a + x.ideas.filter((i) => statusMeta(i.status as WorkflowStatus).who.toUpperCase().includes('CLIENTE')).length,
    0,
  );

  return <main className="min-h-screen bg-negro">
    {/* MEDIDO 2026-10-03. Los botones flotantes (`INSTALAR EL HUB` y la guía)
        ocupan la esquina inferior derecha, unos 5rem. Con una portada larga, el
        contenido bajaba hasta underneath y el flotante tapaba texto: MEDIDO en el
        navegador, "04 · LA SALIDA" estaba en y=511 y el botón en y=515.
        Este `pb` deja aire para que el final de la página nunca quede debajo de
        la esquina. No es decoración: es lo que hace legible la última fila. */}
    <div className="mx-auto max-w-6xl px-5 py-14 pb-32 md:px-10 md:pt-20 md:pb-36">

      {/* Qué es esto. Primero, antes de cualquier cifra: quien abre el link no
          sabe si está mirando un tablero, un CRM o un calendario. */}
      <header className="anim-rise">
        <p className="eyebrow">[RR ALIADOS · CONTENIDO]</p>
        <h1 className="display-title anim-rise mt-4" style={{ animationDelay: '80ms' }}>
          Aquí vive cada pieza de contenido.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-blanco-70 anim-rise" style={{ animationDelay: '160ms' }}>
          Un solo lugar donde una idea de Wundeer o de Candilejas deja de ser un mensaje suelto
          y se vuelve un trabajo con dueño, fecha y estado. La puerta es el código del cliente:
          cuatro dígitos y tu nombre, sin correos ni contraseñas.
        </p>
        <p className="mt-5 font-mono text-[11px] leading-6 text-blanco-50 anim-rise" style={{ animationDelay: '200ms' }}>
          {abiertos.length === 1
            ? `1 cliente abierto · ${totalPiezas} piezas en total`
            : `${abiertos.length} clientes abiertos · ${totalPiezas} piezas en total${esperando ? ` · ${esperando} esperando al cliente` : ''}`}
        </p>
      </header>

      {/* El flujo. Cuatro pasos, en una línea: esto es lo que hace el hub y no
          hace falta entrar para entenderlo. */}
      <ol className="mt-10 grid gap-px border border-blanco-20 bg-blanco-10 sm:grid-cols-2 lg:grid-cols-4 anim-rise"
        style={{ animationDelay: '260ms' }}>
        {FASES.map((fase, i) => <li key={fase.nombre} className="bg-negro p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-blanco-20 text-blanco-60">
              <Icon name={fase.icono} size={14} />
            </span>
            <p className="mono-label text-blanco-70">{String(i + 1).padStart(2, '0')} · {fase.nombre}</p>
          </div>
          <p className="mt-3 font-mono text-[10px] leading-5 text-blanco-60">{fase.texto}</p>
        </li>)}
      </ol>

      {/* Elegir cliente. El corazón de la portada. Cada tarjeta trae su conteo
          real, para que se sepa qué hay antes de abrir. */}
      <section aria-label="Elige un cliente" className="mt-12 anim-rise" style={{ animationDelay: '320ms' }}>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-blanco-20 pb-4">
          <h2 className="font-display text-3xl font-bold text-blanco md:text-4xl">
            {abiertos.length === 1 ? 'Tu cliente' : 'Elige por dónde empezar'}
          </h2>
          <p className="font-mono text-[10px] text-blanco-50">
            {abiertos.length === 1 ? 'SOLO TIENES UNO ABIERTO' : `${abiertos.length} PARA ABRIR`}
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {conConteo.map(({ cliente, ideas }, indice) => {
            const esActual = cliente.slug === sesionActual;
            const counts = BOARD_COLUMNS.map((c) => ({
              ...c,
              n: ideas.filter((i) => (c.statuses as readonly string[]).includes(i.status)).length,
            }));
            const enVotacion = ideas.filter((i) => i.status === 'voting').length;
            const masGrande = Math.max(...counts.map((c) => c.n), 1);
            /* MEDIDO 2026-10-05: la descripción entera se pintaba aquí y
               Wundeer ocupaba 2.080 px de alto. Ver `resumen-proyecto.ts`. */
            const resumenCliente = resumenProyecto(cliente.description);
            const tieneFichaLarga = seccionesProyecto(cliente.description) > 1;

            return <Link
              key={cliente.slug}
              href={`/${cliente.slug}`}
              className="group relative flex flex-col border border-blanco-20 bg-blanco-05 p-6 transition-colors duration-300 hover:border-fucsia hover:bg-blanco-10 md:p-8"
              style={{ animationDelay: `${indice * 100}ms` }}
            >
              {esActual && (
                <span className="absolute right-5 top-5 border border-fucsia px-2 py-0.5 font-mono text-[9px] text-blanco-80">
                  AQUÍ ESTÁS
                </span>
              )}
              <div className="flex items-center gap-4">
                <span aria-hidden="true" className="h-9 w-9 shrink-0 border border-blanco-40"
                  style={cliente.brand_primary_color ? { backgroundColor: cliente.brand_primary_color } : undefined} />
                <div className="min-w-0">
                  {/* El rol crudo en pantalla era `CLIENT_VIEWER`, que es un nombre
                      de tabla y no una palabra. Para quien entra sin sesión, que es
                      casi todo el mundo desde el 2026-10-02, poner el rol en
                      mayúsculas lo hace parecer un error. */}
                  <p className="mono-label text-blanco-50">
                    [{cliente.rol === 'client_viewer' ? 'LECTURA' : cliente.rol.toUpperCase()}]
                  </p>
                  <h3 className="mt-1 font-display text-3xl font-bold text-blanco md:text-4xl">{cliente.name}</h3>
                </div>
              </div>

              {/*
                MEDIDO 2026-10-05 (feedback de diseño): aquí se pintaba
                `cliente.description` entero. Wundeer traía 4.108 caracteres y
                la caja medía 292×2080 px: «LECCION DE ESTE ENCARGO», «QUE
                CAMBIA EL ENCARGO», «DESCARTADAS Y RESPALDADAS» y «A REVISAR
                POR SANTIAGO» no son instrucciones de trabajo, son historial de
                por qué se descartó cada cosa.

                Ahora va el resumen, y el resto se abre en la ficha del
                proyecto. El resumen lo arma `resumenProyecto`, que es pura.
                */}
              {resumenCliente && (
                <div className="mt-4">
                  <p className="line-clamp-4 font-mono text-[10px] leading-5 text-blanco-60">
                    {resumenCliente}
                  </p>
                  {tieneFichaLarga && (
                    <Link
                      href={`/${cliente.slug}/ideas`}
                      className="mt-2 inline-flex min-h-[44px] items-center font-mono text-[10px] text-blanco-40 underline underline-offset-4 hover:text-blanco-70"
                    >
                      VER LA FICHA COMPLETA
                    </Link>
                  )}
                </div>
              )}

              <div className="mt-6 flex items-end gap-6">
                <p>
                  <span className="block font-display text-5xl font-bold text-blanco">{ideas.length}</span>
                  <span className="font-mono text-[10px] text-blanco-50">PIEZAS</span>
                </p>
                {enVotacion > 0 && (
                  <p>
                    <span className="block font-display text-3xl font-bold text-mostaza">{enVotacion}</span>
                    <span className="font-mono text-[10px] text-blanco-50">POR VOTAR</span>
                  </p>
                )}
              </div>

              <ol className="mt-5 space-y-1.5">
                {counts.filter((c) => c.n > 0).map((c) => (
                  <li key={c.key} className="grid grid-cols-[minmax(0,8rem)_1fr_2rem] items-center gap-3">
                    <span className="truncate font-mono text-[10px] text-blanco-60">{c.label}</span>
                    <span aria-hidden="true" className="block h-1.5 bg-blanco-10">
                      <span className="block h-1.5 bg-blanco-70 transition-[width] duration-700"
                        style={{ width: `${Math.max(4, Math.round((c.n / masGrande) * 100))}%` }} />
                    </span>
                    <span className="text-right font-mono text-[10px] tabular-nums text-blanco">{c.n}</span>
                  </li>
                ))}
              </ol>

              <span className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] text-blanco-70 transition-colors group-hover:text-blanco">
                ABRIR EL TABLERO <Icon name="arrow" size={14} />
              </span>
            </Link>;
          })}
        </div>

        {cerrados.length > 0 && (
          <div className="mt-6 border border-blanco-10 p-5">
            <p className="mono-label text-blanco-40">SIN ACCESO · {cerrados.length}</p>
            <ul className="mt-3 space-y-2">
              {cerrados.map((c) => (
                <li key={c.slug} className="flex items-center gap-3 font-mono text-[10px] text-blanco-50">
                  <Icon name="lock" size={12} />
                  <span>{c.name}</span>
                  <span className="text-blanco-40">
                    {c.motivo === 'sin-codigo' ? 'sin código de entrada' : 'tu correo no tiene acceso'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/*
        MEDIDO 2026-10-05 (feedback de Santiago): este párrafo decía «La auditoría
        es la vista de solo lectura» y el enlace se llamaba «ABRE LA AUDITORÍA».
        Se va: la auditoría no es solo lectura y el nombre hacía creer que no se
        podía tocar nada. Ahora el enlace dice lo que hace — mirar las métricas —
        y el párrafo solo dice cómo llegar a cada cliente.
        */}
      <p className="mt-12 border-t border-blanco-10 pt-6 font-mono text-[10px] leading-6 text-blanco-50">
        Cada cliente tiene su tablero con las piezas, quién las tiene y qué falta.{' '}
        <Link href={`/${abiertos[0].slug}/metricas`}
          /* MEDIDO 2026-10-03 a 390 px: este enlace medía 184x11 px. Once de
             alto: con un dedo no se abre, y es el enlace que lleva a las métricas. */
          className="inline-flex min-h-[44px] items-center text-blanco-70 underline underline-offset-4 hover:text-blanco">
          MIRA LAS MÉTRICAS
        </Link>
        {' '}También puedes ir directo: cada cliente vive en <span className="text-blanco-60">/wundeer</span>,{' '}
        <span className="text-blanco-60">/candilejas</span>.
      </p>

      {/*
        MEDIDO 2026-11-09: `/login` era un «sin destino» — la spec v2 lo
        declaraba inexistente y no había ni un enlace que lo llevara. Ahora la
        puerta existe y es el camino de entrada: cuatro dígitos y tu nombre.
      */}
      <div className="mt-8 border border-blanco-20 p-6 md:p-8">
        <p className="eyebrow text-blanco-50">[LA PUERTA]</p>
        <h2 className="mt-3 font-display text-2xl font-bold text-blanco md:text-3xl">
          Entrar con el código de tu cliente
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-blanco-70">
          Son cuatro dígitos y tu nombre. El código abre el cliente; lo que puedes hacer
          dentro lo decide tu rol, y ese no cambia con el código.
        </p>
        <Link href="/login" className="btn-brutal mt-5 inline-flex min-h-[44px] items-center gap-2">
          <Icon name="arrow" size={14} /> ENTRAR
        </Link>
      </div>
    </div>
  </main>;
}