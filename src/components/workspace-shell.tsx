'use client';

import Image from 'next/image';
import { salir } from '@/lib/hub-client';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GuidedTour } from './guided-tour';
import { Icon, type IconName } from './ui/icons';
import { SelectorPerfil } from '@/components/selector-perfil';
import { AUTH_ENABLED } from '@/lib/mode';
import { HubFooter } from '@/components/hub-footer';
import { SelectorCliente, type ClienteParaPintar } from '@/components/selector-cliente';
import { logoDeCliente } from '@/lib/logo-cliente';

/**
 * Cascarón del proyecto.
 *
 * Simplificado el 2026-09-26 después de medir el tablero: **47 cosas clicables,
 * 47 etiquetas distintas y 822 palabras** en una pantalla. Qué se hizo:
 *
 *  1. La navegación de fases del header se eliminó: repetía la barra lateral y
 *     los cuatro pasos que la guía del tablero ya muestra con sus conteos.
 *  2. Cuatro secciones quedan a la vista (tablero, piezas, espera respuesta,
 *     plan) con nombres en español llano. Rodaje y publicación pasan a "ver
 *     más": son de uso interno y se llega igual desde la guía de pasos.
 *  3. La letra subió: las etiquetas de navegación de 12 a 14 px y las ayudas de
 *     10 a 12 px. Nada clicable queda por debajo de 12 px.
 *  4. El modo guía (botón flotante "¿CÓMO SE USA?") explica cada botón.
 *
 * La barra se puede compactar (queda en `localStorage`, así que la preferencia
 * sobrevive recargas).
 *
 * El rol no se dibuja a propósito: cualquiera con el link ve el tablero
 * completo, así que la navegación no finge permisos.
 */
/**
 * La navegación, agrupada.
 *
 * MEDIDO 2026-11-09: la barra tenía siete entradas sueltas y un «VER MÁS» que
 * escondía dos destinos. Con la especificación v2 en la mano, el trabajo se
 * agrupa bajo «Trabajo» y el resto de destinos se nombran de frente: un
 * «VER MÁS» es un destino que no se ve, y un destino que no se ve es un
 * destino que no existe para quien lo necesita.
 *
 *   TRABAJO   · resumen, piezas, producción y publicaciones (el trabajo diario)
 *   ESTUDIO   · material, editar foto, editar video y Flow (producir y entregar)
 *   DECISIONES · la cola de decisiones del equipo y las aprobaciones del cliente
 *   PROYECTO  · métricas, hoja de ruta, plan de publicación y perfil
 *
 * «Decisiones del equipo» sustituye a «Votación interna»: el nombre viejo
 * prometía una votación y lo que hay es una cola con motivo, versión y
 * siguiente paso. Y «Flow · IA» sigue siendo UN solo botón externo, sin
 * cuenta preseleccionada.
 */
type Entrada = { label: string; path: string; help: string; icon: IconName };

const GRUPOS: readonly { titulo: string; entradas: readonly Entrada[] }[] = [
  {
    titulo: 'Trabajo',
    entradas: [
      { label: 'RESUMEN', path: '', help: 'El tablero del proyecto', icon: 'map' },
      { label: 'PIEZAS', path: '/ideas', help: 'La lista completa', icon: 'pieces' },
      { label: 'PRODUCCIÓN', path: '/produccion', help: 'Rodaje y edición', icon: 'camera' },
      { label: 'PUBLICACIONES', path: '/publicaciones', help: 'Lo que ya salió', icon: 'publish' },
    ],
  },
  {
    titulo: 'Estudio',
    entradas: [
      { label: 'MATERIAL', path: '/material', help: 'Drive, edición y entrega', icon: 'folder' },
      { label: 'EDITAR FOTO', path: '/editar/foto', help: 'Retocar, sin salir del hub', icon: 'image' },
      { label: 'EDITAR VIDEO', path: '/editar/video', help: 'Montar y exportar', icon: 'video' },
      { label: 'FLOW · IA', path: '/flow-ia', help: 'Fotos y video con IA', icon: 'spark' },
    ],
  },
  {
    titulo: 'Decisiones',
    entradas: [
      { label: 'DECISIONES DEL EQUIPO', path: '/ideas/en-votacion', help: 'Lo que hay que decidir', icon: 'decisions' },
      { label: 'APROBACIONES', path: '/aprobaciones', help: 'Lo que espera al cliente', icon: 'clock' },
    ],
  },
  {
    titulo: 'Proyecto',
    entradas: [
      { label: 'MÉTRICAS', path: '/metricas', help: 'Cómo va el proyecto', icon: 'chart' },
      { label: 'HOJA DE RUTA', path: '/roadmap', help: 'Cuánto falta para el final', icon: 'roadmap' },
    ],
  },
];

const STORAGE_KEY = 'rr-hub-aside';
const STORAGE_EVENT = 'rr-hub-aside-change';

/**
 * La preferencia de la barra vive en localStorage. Se lee con
 * useSyncExternalStore (y no con un useEffect + setState) para que el primer
 * render del servidor y del cliente coincidan: en el servidor siempre arranca
 * expandida, y al hidratar toma lo guardado sin producir un render en cascada.
 */
function subscribeAside(callback: () => void) {
  window.addEventListener(STORAGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(STORAGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function readAside(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Quién está dentro, y si puede escribir.
 *
 * El servidor ya sabe el rol (`access.role_in_project`) y por eso no hay que
 * adivinarlo: se pasa como prop. Aquí solo se lee la sesión del navegador para
 * pintar "INICIAR SESIÓN" o "VER PERFIL", que antes no existían en ninguna parte
 * de la interfaz — no había forma de entrar desde el hub ni de salir.
 *
 * `rol` decide si el botón de crear es una trampa: un `client_viewer` ve el
 * mismo botón que un `owner` y al pulsarlo recibe un 401. Con `puedeCrear` se
 * muestra, pero directo al login, sin el falso intento.
 */
function useSesion(emailServidor?: string, nombreServidor?: string) {
  const [correo, setCorreo] = useState<string | null>(emailServidor ?? null);
  // MEDIDO 2026-10-01, Santiago: "solo necesito que cuando él entre aparezca el
  // nombre de él en el contenido". El servidor YA mandaba el nombre:
  // `/api/quien-soy` responde `{email, nombre, proyecto, id}` y con la sesión de
  // Nicolás devuelve "Nicolás David Río Vargas". El shell solo leía `email` y
  // se olvidaba de `nombre`, así que en toda la app solo se veía el correo.
  //
  // No es un dato inventado ni una copyrighted: es el nombre que la persona
  // eligió en la puerta, y el servidor ya lo tenía.
  const [nombre, setNombre] = useState<string | null>(nombreServidor ?? null);
  const router = useRouter();

  useEffect(() => {
    // La puerta es un código por cliente (2026-09-28), así que no hay sesión de
    // Supabase que escuchar: la cookie del hub no emite eventos. Se pregunta una
    // vez quién entró, con `no-store` para que no se quede pegado el nombre de
    // la persona anterior.
    let vivo = true;
    void fetch('/api/quien-soy', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((cuerpo) => {
        if (!vivo) return;
        setCorreo(cuerpo?.email ?? null);
        setNombre(cuerpo?.nombre ?? null);
      })
      .catch(() => {
        if (vivo) setCorreo(null);
      });
    return () => { vivo = false; };
  }, []);

  async function cerrarSesion() {
    await salir();
    router.push('/');
    router.refresh();
  }

  return { correo, nombre, cerrarSesion };
}

/**
 * `clientes` lo pasa el servidor (`getClientesDeLaPersona`): qué clientes puede
 * abrir esta persona y cuáles existen pero no puede. Sin esta prop el hub se
 * quedaba en un solo cliente y cambiar obligaba a cerrar sesión —que era
 * exactamente el reporte del 2026-09-29—.
 */
type ListaDeClientes = {
  abiertos: ClienteParaPintar[];
  cerrados: ClienteParaPintar[];
  actual: string | null;
};

export function WorkspaceShell({ children, project, role, email, nombre, puedeEscribir = true, clientes, tienePlanSocial = false }: { children: React.ReactNode; project: { slug: string; name: string; client_name: string }; role: string; email?: string; nombre?: string; puedeEscribir?: boolean; clientes?: ListaDeClientes; tienePlanSocial?: boolean }) {
  const params = useParams<{ projectSlug: string }>();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileFirstItemRef = useRef<HTMLAnchorElement>(null);
  const collapsed = useSyncExternalStore(subscribeAside, readAside, () => false);
  const slug = params.projectSlug;
  const sesion = useSesion(email, nombre);
  /** MEDIDO 2026-10-05: el logo del cliente en la barra. Ver `logo-cliente.ts`. */
  const logoCliente = logoDeCliente(slug);

  useEffect(() => {
    if (!profileOpen) return;
    profileFirstItemRef.current?.focus();
    const cerrar = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof MouseEvent && profileMenuRef.current?.contains(event.target as Node)) return;
      setProfileOpen(false);
    };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', cerrar);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', cerrar);
    };
  }, [profileOpen]);

  function toggleCollapsed() {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '0' : '1');
    } catch {
      /* sin persistencia, pero el cambio se aplica igual */
    }
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }

  function enlace(item: { label: string; path: string; help: string; icon: IconName }) {
    const href = `/${slug}${item.path}`;
    const active = item.path ? pathname.startsWith(href) : pathname === `/${slug}`;
    return (
      <Link
        key={item.label}
        href={href}
        title={item.help}
        onClick={() => setMenuOpen(false)}
        aria-current={active ? 'page' : undefined}
        className={`group flex items-center gap-3 border-l-2 py-3 transition-colors ${collapsed ? 'md:justify-center md:px-0' : 'items-start px-3'} ${active ? 'border-blanco bg-blanco-10 text-blanco' : 'border-transparent text-blanco-60 hover:border-blanco-40 hover:bg-blanco-05 hover:text-blanco'}`}
      >
        <span className={`shrink-0 ${collapsed ? '' : 'mt-[3px]'} ${active ? 'text-blanco' : 'text-blanco-40 group-hover:text-blanco'}`}>
          <Icon name={item.icon} size={18} />
        </span>
        <span className={`collapse-label min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
          <strong className="block font-mono text-sm tracking-[0.05em]">{item.label}</strong>
          <small className="mt-1 block text-xs leading-4 text-blanco-50">{item.help}</small>
        </span>
      </Link>
    );
  }

  return (
    <div className="min-h-screen bg-negro md:flex">
      {menuOpen && (
        <button aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} className="mobile-nav-backdrop fixed inset-0 z-30 bg-negro/80 md:hidden" />
      )}

      <aside
        className={`shell-aside fixed inset-y-0 left-0 z-40 flex flex-col overflow-y-auto border-r border-blanco-20 bg-negro transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'md:w-[4.5rem] p-3' : 'w-72 p-6'}`}
      >
        <div className={`mb-6 flex items-center gap-3 ${collapsed ? 'md:flex-col md:gap-2' : 'justify-between'}`}>
          <Link href={`/${slug}`} title={project.name} className="flex items-center gap-3">
            <Image src="/brand/rr-symbol-fucsia-on-negro.png" alt="RR Aliados" width={52} height={40} className="h-10 w-auto object-contain" />
            <span className={`collapse-label font-display text-xl font-bold text-blanco ${collapsed ? 'md:hidden' : ''}`}>RR / {project.name.toUpperCase()}</span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expandir el menú' : 'Compactar el menú'}
            title={collapsed ? 'Expandir el menú' : 'Compactar el menú'}
            className="hidden h-8 w-8 shrink-0 items-center justify-center border border-blanco-20 text-blanco-60 transition-colors hover:border-blanco-40 hover:text-blanco md:flex"
          >
            <span className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}>
              <Icon name="chevron" size={14} />
            </span>
          </button>
        </div>

        {/* Selector de cliente, justo debajo de la marca. Va en la barra y no en
            el header porque la barra es lo que se mantiene al navegar entre
            clientes: `/candilejas` vuelve a pintar el mismo shell, así que el
            selector está siempre en el mismo sitio sin trabajo extra.

            Con la barra compactada solo se ve el punto de color, para no gastar
            los 4,5 rem en texto. El nombre completo sigue en el `title` y en la
            etiqueta accesible. */}
        {clientes && (clientes.abiertos.length > 1 || clientes.cerrados.length > 0) && (
          <div className={`mb-4 ${collapsed ? 'md:px-0' : ''}`}>
            <SelectorCliente
              actual={clientes.actual ?? slug}
              abiertos={clientes.abiertos}
              cerrados={clientes.cerrados}
              compacto={collapsed}
            />
          </div>
        )}

        <nav className="mt-2 space-y-4" aria-label="Menú principal">
          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo}>
              <p className={`px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-blanco-40 ${collapsed ? 'md:hidden' : ''}`}>
                {grupo.titulo}
              </p>
              <div className="mt-1 space-y-1">{grupo.entradas.map(enlace)}</div>
            </div>
          ))}

          {/*
            El plan de publicación solo se ofrece cuando el cliente lo tiene.
            Antes la entrada estaba siempre y SÁTIRO y BOGA —que no lo tienen—
            llevaban a un 404: un enlace que promete un plan y no hay plan.
          */}
          {tienePlanSocial && (
            <div>
              <p className={`px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-blanco-40 ${collapsed ? 'md:hidden' : ''}`}>
                Publicación
              </p>
              <div className="mt-1 space-y-1">
                {enlace({ label: 'PLAN DE PUBLICACIÓN', path: '/redes', help: 'Feed, orden y aprobación', icon: 'publish' })}
              </div>
            </div>
          )}
        </nav>

        <div className="mt-auto space-y-3 border-t border-blanco-10 pt-5">
          {/* Crear vive en UN solo lugar: el botón del banner, siempre visible.
              Tenerlo también aquí y en la cabecera del tablero daba tres botones
              idénticos en la misma pantalla. */}
          <p className={`collapse-label font-mono text-[11px] leading-5 text-blanco-50 ${collapsed ? 'md:hidden' : ''}`}>
            RR CONTENT HUB · {project.name.toUpperCase()}<br />Datos vivos de Supabase
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-blanco-20 bg-negro/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-5 py-3 md:px-10">
            <button onClick={() => setMenuOpen(true)} className="inline-flex items-center gap-2 border border-blanco-20 px-2 py-1.5 font-mono text-xs text-blanco-70 md:hidden">
              <Icon name="list" size={14} /> MENÚ
            </button>
            <div className="hidden items-center gap-4 md:flex">
              {/* MEDIDO 2026-10-05 (feedback de Santiago: «aquí quiero el logo
                  de wundeer»). Antes era el nombre en monoespaciada: «WUNDEER ·
                  TODO EL CONTENIDO EN UN LUGAR». Un nombre en una barra es lo que
                  dice cualquier sistema; el logo hace que la pantalla se vea del
                  cliente.

                  El nombre no desaparece: pasa a ser el `alt` del logo, que es lo
                  que un lector de pantalla lee y lo que se ve al no cargar la
                  imagen. Si el cliente no tiene logo, `logoDeCliente` devuelve
                  null y cae al texto, que es lo correcto: un hueco se nota; una
                  imagen rota en la barra se nota peor. */}
              {logoCliente ? (
                <Link href={`/${slug}`} className="inline-flex items-center" title={`${project.name} · todo el contenido en un lugar`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoCliente}
                    alt={`${project.name} · todo el contenido en un lugar`}
                    width={274}
                    height={80}
                    className="h-5 w-auto object-contain opacity-80 transition-opacity hover:opacity-100"
                  />
                </Link>
              ) : (
                <Link href={`/${slug}`} className="font-mono text-xs text-blanco-60 transition-colors hover:text-blanco">
                  {project.name.toUpperCase()} · TODO EL CONTENIDO EN UN LUGAR
                </Link>
              )}
              {/* MEDIDO 2026-10-03: la votación interna solo se llegaba a través
                  de la ficha de cada idea. Con 18 piezas en `voting`, eso es
                  recorrer el tablero buscando cuál abrir. Este enlace va en la
                  barra, no dentro de un menú, porque la reunión empieza buscando
                  "qué hay que decidir hoy".
                  MEDIDO 2026-11-09: el nombre era «VOTACIÓN INTERNA» y mentía:
                  lo que hay es una cola con motivo, versión y siguiente paso, no
                  una votación a la que se llegue votando. Ahora se llama
                  «DECISIONES DEL EQUIPO», que es lo que es. */}
              <Link
                href={`/${slug}/ideas/en-votacion`}
                className="border border-mostaza-40 px-2 py-1 font-mono text-[10px] text-mostaza transition-colors hover:border-mostaza"
              >
                DECISIONES DEL EQUIPO
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {/* El hub está en modo abierto mientras el login de Google se
                  resuelve: el acceso no se pide, así que aquí ya no hay nada
                  que entrar. El botón se guardó en el código, no se borra —
                  vuelve con `NEXT_PUBLIC_AUTH_ENABLED=true`. */}
              {AUTH_ENABLED && (sesion.correo ? (
                <div ref={profileMenuRef} className="relative">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                    onClick={() => setProfileOpen((open) => !open)}
                    className="inline-flex items-center gap-2 border border-blanco-20 px-2 py-1.5 font-mono text-[10px] text-blanco-70 hover:border-blanco-40"
                  >
                    <span className="inline-block h-4 w-4 border border-blanco-40 text-center leading-4 text-blanco-80">
                      {(sesion.nombre ?? sesion.correo).slice(0, 1).toUpperCase()}
                    </span>
                    <span title={sesion.correo} className="hidden max-w-32 truncate sm:inline">{sesion.nombre ?? sesion.correo}</span>
                  </button>
                  {profileOpen && (
                    <div role="menu" className="absolute right-0 z-30 mt-1 w-64 border border-blanco-20 bg-negro p-3">
                      <p className="font-mono text-[10px] leading-5 text-blanco-60">
                        <span className="block text-blanco-80">{sesion.nombre ?? sesion.correo}</span>
                        Rol en {project.name}: <span className="text-orquidea">{role.replace('_', ' ')}</span>
                      </p>
                      <div className="mt-3 flex flex-col gap-1">
                        <Link ref={profileFirstItemRef} role="menuitem" href={`/${slug}/perfil`} onClick={() => setProfileOpen(false)} className="btn-ghost">VER PERFIL</Link>
                        <button role="menuitem" onClick={sesion.cerrarSesion} className="btn-ghost">CERRAR SESIÓN</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // SIN PUERTA (2026-10-02): este botón iba a `/login`, que ya no
                // existe. Un enlace a una pantalla borrada es un 404 con un texto
                // que promete entrar, o sea lo peor de los dos.
                //
                // Ahora dice lo que es verdad: se está leyendo sin sesión y para
                // escribir hace falta que Dirección dé de alta el acceso. No
                // ofrece un camino que no hay.
                /* MEDIDO 2026-10-03. Antes esto era un <span> con el texto SOLO
                   LECTURA: deadweight puro. No hacía nada y, peor, decía que no
                   se podía hacer nada, cuando lo que no se podía era ESCRIBIR en
                   el tablero. La votación interna sí se puede, y es justo lo que
                   el equipo viene a hacer.
                   Ahora enlaza al selector de perfil de la ficha, que es donde se
                   elige con qué nombre se vota. Un enlace que lleva a donde se
                   resuelve; un cartel que no lleva a ninguna parte es un callejón. */
                /* MEDIDO 2026-10-03. Aquí había un ENLACE a
                   `/${slug}/ideas/en-votacion` con el texto ELEGIR QUIÉN VOTA. Un
                   enlace con esa etiqueta promete una acción —elegir— y entrega
                   otra cosa: otra pantalla. MEDIDO en producción: en el tablero no
                   había forma de cambiar de perfil, porque el único camino era
                   salirse del tablero.

                   Ahora el selector está AQUÍ, en la barra de la pantalla en la que
                   se está. El enlace a la pantalla de votación se queda al lado,
                   porque esa lista de ideas para votar es útil en sí misma. */
                <div className="flex items-start gap-2">
                  <SelectorPerfil slug={slug} pedirEquipo />
                  <Link
                    href={`/${slug}/ideas/en-votacion`}
                    className="inline-flex items-center gap-2 border border-blanco-20 px-2 py-1.5 font-mono text-[10px] text-blanco-70 hover:border-blanco-50"
                  >
                    DECISIONES DEL EQUIPO
                  </Link>
                  {/* La puerta del hub. Antes no había ninguna: el hub estaba
                      abierto y no se entraba a ninguna parte. Con la puerta por
                      código, este enlace es el camino de entrada y el de
                      salida. */}
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 border border-blanco-20 px-2 py-1.5 font-mono text-[10px] text-blanco-70 hover:border-blanco-50"
                  >
                    ENTRAR
                  </Link>
                </div>
              ))}

              {puedeEscribir ? (
                <Link href={`/${slug}/ideas/nueva`} className="btn-brutal inline-flex items-center gap-2">
                  <Icon name="plus" size={14} /> NUEVA PIEZA
                </Link>
              ) : (
                /* MEDIDO 2026-10-03. Este <span> decía SOLO LECTURA y era
                   deadweight: no era un enlace, no hacía nada, y estaba justo
                   al lado del selector de perfil que SÍ abre. Leído en fila dice
                   «no puedes hacer nada aquí», que es falso: la votación interna
                   es lo que este equipo viene a hacer, y se puede. Lo que no se
                   puede es crear piezas, y eso ya se explica dentro del tablero.
                   Un cartel que no lleva a ninguna parte es un callejón. */
                null
              )}
            </div>
          </div>
        </header>
        {/* La ficha de una pieza y el tablero traen su propio `<main>` con su
            encabezado. Envolverlos aquí producía DOS `main` en el documento —
            HTML invalido, y `getByRole('contentinfo')` del pie quedaba en un
            árbol raro. Aquí solo se entrega el contenido y el pie, sin `main`:
            cada página conserva el suyo. */}
        {children}
        <HubFooter slug={slug} projectName={project.name} />
      </div>

      <GuidedTour />
    </div>
  );
}
