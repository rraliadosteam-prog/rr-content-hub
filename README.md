# RR Content Hub

Sistema multi-cliente de RR ALIADOS para ideación, aprobación, producción y publicación de contenido orgánico y de pauta.

## Estado actual: MODO PÚBLICO (solo lectura)

El hub está abierto: **cualquiera con el link ve todo** lo que ve el admin, sin credenciales, en solo lectura.

- Producción: https://rr-content-hub.vercel.app
- Autenticación desactivada por interruptor: `NEXT_PUBLIC_AUTH_ENABLED=true` la reactiva (Google OAuth ya está configurado).
- La escritura anónima está bloqueada por RLS: solo existen políticas `SELECT` para `anon`.
- Detalle completo: [`docs/AUDIT_MODE.md`](docs/AUDIT_MODE.md).

### Rutas principales

| Ruta | Qué muestra |
|---|---|
| `/` | Entrada al primer proyecto |
| `/select-project` | Los tres proyectos (Wundeer, Satiro, BOGA) |
| `/<proyecto>` | Dashboard, fases y cola de trabajo |
| `/<proyecto>/ideas` · `/ideas/<id>` | Banco de piezas y ficha completa |
| `/<proyecto>/flow-ia` | Flow · Fotos y video con IA (se abre en otra pestaña; el archivo vuelve por Drive) |
| `/<proyecto>/material` | Material: carpeta de Drive, edición de fotos, entrega y registro de auditoría |
| `/<proyecto>/aprobaciones · produccion · publicaciones · metricas` | Colas por fase |
| `/audit` · `/audit/admin` | Índice global y panel de equipo/accesos |

Rol nocturno / detalle de flujo: [`docs/FLOW_REDESIGN.md`](docs/FLOW_REDESIGN.md).

## Stack

- Next.js 16 (App Router) + React + TypeScript
- Supabase (Postgres + Auth + Storage)
- Vercel

Las tablas viven en el namespace `rr_hub_*` dentro de un proyecto Supabase compartido con otras herramientas de RR, por lo que nunca se tocan las tablas legacy del CRM.

## Desarrollo

```bash
npm install
cp .env.example .env.local
npm run dev
```

Para datos reales hay que configurar Supabase y las variables de `.env.example`.

### Google Flow (ruta A)

El módulo **Flow · Fotos y video con IA** (`/<proyecto>/flow-ia`) no incrusta Flow ni usa una API. Abre el selector de cuentas de Google en otra pestaña, con un aviso claro de que se abre FUERA del hub, y el archivo vuelve por la carpeta de Drive que la persona elija en Material. La interfaz está en español de Colombia y usa los tokens que ya tiene el hub (negro, crema, fucsia, mostaza, orquídea; Space Grotesk y DM Mono).

**Cuentas:** cada persona entra con SU correo personal. El hub no preselecciona ninguna cuenta: el enlace no lleva `Email`, ni `hd`, ni `login_hint`, y no existe una cuenta de empresa compartida. La variable `NEXT_PUBLIC_FLOW_DEFAULT_ACCOUNT` se quitó por eso.

### Material: Drive, edición y entrega

El módulo **Material** (`/<proyecto>/material`) es el recorrido completo:

1. **Carpeta de Drive** con el Google Picker y el alcance `drive.file`. La persona elige la carpeta: el hub solo ve los archivos de esa carpeta. Se puede buscar, bajar y subir. **Nunca se borra un archivo ni se cambian sus permisos** (el proxy no tiene esa acción).
2. **Edición de fotos dentro del hub**, en el navegador: recorte (libre, 1:1, 4:5, 9:16, 16:9), giro de 90°, brillo, contraste, saturación y blanco y negro. El video va como **«Próximamente»**.
3. **Aviso de cliente ajeno**: todos los editores ven todo el material, de todos los clientes; cuando el archivo es de otro cliente (se deduce del prefijo `cliente_pieza_fecha`) aparece el aviso.
4. **Entrega**: solo la **versión final** se copia al almacenamiento privado (`rr-content-assets`, bucket privado) y se devuelve un **enlace firmado que vence**. Los borradores no se entregan.
5. **Registro de auditoría**: quién **sube**, quién **registra** y quién **entrega**, con nombre de persona y con la cuenta de Google con la que se tocó Drive. Vive en `rr_hub_audit_log` (tabla `rr_hub_material`), que ya existe: este módulo **no crea migraciones**.

Variables de entorno

Todas públicas salvo la última. Van en `.env.example` y, para que el equipo las vea, también en el entorno de Vercel (Preview y Production). **Sin valores reales y sin secretos**: no hay llaves privadas, ni contraseñas, ni tokens en el repositorio.

| Variable | Quién la llena | Si está vacía |
|---|---|---|
| `NEXT_PUBLIC_FLOW_DRIVE_FOLDER_URL` | Dirección. Enlace `https` de la carpeta en `drive.google.com`. | El bloque «Devolver al hub» dice: «Pendiente: Dirección configura la carpeta de Drive». |
| `NEXT_PUBLIC_GOOGLE_API_KEY` | Dirección. Llave pública de la API de Google (Picker y Drive). **Pendiente de configurar.** | Material funciona con material de ejemplo y lo dice en pantalla. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Dirección. Identificador del cliente OAuth (aplicación web). **Pendiente de configurar.** | Igual que arriba. |
| `HUB_ENTREGA_URL_MINUTOS` | Dirección. Minutos de vida del enlace firmado. **Pendiente de configurar.** (60 por defecto) | Los enlaces firmados duran 60 minutos. |

El acceso a Drive es con la cuenta personal de cada persona: no se comparten contraseñas y los créditos de Flow son los de su plan.

## Base de datos

Migraciones canónicas e idempotentes, en orden:

1. `supabase/migrations/20260910_content_hub_isolated.sql` — esquema base, RLS y bucket.
2. `supabase/migrations/20260911_global_audit.sql` — interruptor global de auditoría y políticas de lectura anónima.

## Despliegue

Las credenciales nunca se guardan en el repositorio; viven en Vercel Environment Variables.

```bash
npx vercel build --prod && npx vercel deploy --prebuilt --prod
```

## Documentación

- [`docs/AUDIT_MODE.md`](docs/AUDIT_MODE.md) — modo público, interruptores y seguridad.
- [`docs/FLOW_REDESIGN.md`](docs/FLOW_REDESIGN.md) — flujo de 13 estados en 5 fases y reglas por rol.
- [`docs/AUDIT_2026-09-10.md`](docs/AUDIT_2026-09-10.md) — auditoría técnica end-to-end.
- [`DESIGN.md`](DESIGN.md) · [`PRODUCT.md`](PRODUCT.md) — diseño y producto.
