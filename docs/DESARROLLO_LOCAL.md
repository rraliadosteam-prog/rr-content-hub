# Cómo levantar el hub en local (modo ejemplo)

**Fecha:** 9 de noviembre de 2026 · Encargo D (PR #1)

Esto es el entorno con el que se recorrió el hub de punta a punta: **sin Supabase real, sin Google real y
sin escrituras en producción**. El modo ejemplo es el que usan las capturas y el recorrido de Playwright.

## 1. Variables

Crea un `.env.local` en la raíz del repo. **No se versiona** (`.gitignore` lo cubre) y **no lleva ningún
valor real**: la clave de firma es de desarrollo y se genera en el momento.

```bash
# Modo ejemplo: fixtures en memoria + cuaderno local en .data/demo/
NEXT_PUBLIC_HUB_DEMO=true

# Clave con la que se firma la cookie de sesión. OBLIGATORIA y sin valor por
# defecto: la app no arranca sin ella (ver src/lib/hub-session.ts).
HUB_SECRET=$(openssl rand -base64 48)

# Correo que hace de administrador en el modo ejemplo (para poder escribir).
SUPER_ADMIN_EMAILS=visitante@ejemplo.local
```

Copia y pega el resultado en `.env.local`:

```bash
printf 'NEXT_PUBLIC_HUB_DEMO=true\nHUB_SECRET=%s\nSUPER_ADMIN_EMAILS=visitante@ejemplo.local\n' "$(openssl rand -base64 48)" > .env.local
```

## 2. Arrancar

```bash
npm install
npm run dev            # http://localhost:3000
```

## 3. Entrar

La puerta es la de siempre: **cuatro dígitos y tu nombre**.

| Cliente | Código (solo en modo ejemplo) |
|---|---|
| WUNDEER | `9001` |
| SÁTIRO | `9002` |
| BOGA | `9003` |

En `http://localhost:3000/login` se puede teclear el código o pulsar el botón del cliente, que lo escribe.
Después se elige el nombre (`Santiago (ejemplo)`, `Manuel (ejemplo)`, `Visitante (ejemplo)`) y se entra.

Los códigos de ejemplo son `9xxx` **a propósito**: no son los de producción (esos viven en
`rr_hub_projects.access_code` y los edita Dirección). Una puerta de ejemplo no puede abrir la de verdad.

## 4. Qué cambia en el modo ejemplo

| Cosa | En modo ejemplo | En producción |
|---|---|---|
| Lectura | Fixtures + lo guardado en `.data/demo/` | Supabase |
| Escrituras (piezas, comentarios) | `.data/demo/hub.json` (gitignored) | Supabase |
| Puerta | Códigos `9xxx` y equipo de ejemplo | `rr_hub_projects.access_code` y `rr_hub_profiles` |
| Material de Drive | Carpetas y archivos de ejemplo | Google Picker (`drive.file`) |
| Entrega | Enlace de ejemplo (no abre un archivo real) | Bucket privado + enlace firmado que vence |
| Flow | Aviso de que se abre fuera | Igual: Flow es un tercero, sin API documentada |

`NEXT_PUBLIC_HUB_DEMO=true` **se niega a arrancar en producción**: si `VERCEL_ENV=production`, la app lanza
un error al arrancar (`src/lib/demo-mode.ts`).

## 5. Recorrido con clics reales

```bash
npx playwright install chromium      # la primera vez
npx playwright test e2e/recorrido-hub.spec.ts
```

El recorrido entra por la puerta, recorre la navegación agrupada, comenta en una ficha, crea una pieza,
abre Material y el editor de foto, abre el editor de video y su ventana de exportación, comprueba el botón
único de Flow y que la auditoría responde. Falla si un destino devuelve 4xx/5xx, si un botón no lleva a
ninguna parte, si el aviso «Selecciona un clip» no aparece o si la guía tapa «Guardar versión editada».

Las capturas se guardan en `~/rr-encargos/2026-11-09_hub-D/capturas/` (o donde apunte `HUB_CAPTURAS`).

## 6. Lo que NO se hace aquí

- **Cero migraciones.** Si alguna vez hace falta una, se para y se escribe `BLOQUEO_MIGRACION.md`.
- **Cero escrituras en el Supabase real.** El modo ejemplo no abre ningún cliente de Supabase.
- **Ningún secreto** en el repo, en los commits o en los informes. La clave de desarrollo vive solo en
  `.env.local`.
