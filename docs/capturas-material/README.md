# Capturas del módulo de material

Fotos de las pantallas nuevas, tomadas del **dev local en modo demostración**
(`NEXT_PUBLIC_HUB_DEMO=true`, sin credenciales de Google ni de Supabase).

- Escritorio: **1280×800**.
- Celular: **390×844**.

Cómo se tomaron: `node scripts/capturas-material.mjs` (Playwright). El script
además comprueba que lo que se va a capturar está en pantalla, así que una
captura vacía rompe el script en vez de quedar en el PR.

| Pantalla | Escritorio | Celular |
|---|---|---|
| Flow · abrir (fuera del hub) | [`escritorio-01-flow-abrir.png`](capturas-material/escritorio-01-flow-abrir.png) | [`celular-01-flow-abrir.png`](capturas-material/celular-01-flow-abrir.png) |
| Material · inicio | [`escritorio-02-material-inicio.png`](capturas-material/escritorio-02-material-inicio.png) | [`celular-02-material-inicio.png`](capturas-material/celular-02-material-inicio.png) |
| Material · carpetas de ejemplo | [`escritorio-03-material-carpetas-ejemplo.png`](capturas-material/escritorio-03-material-carpetas-ejemplo.png) | [`celular-03-material-carpetas-ejemplo.png`](capturas-material/celular-03-material-carpetas-ejemplo.png) |
| Material · archivos de otro cliente | [`escritorio-04-material-lista-otro-cliente.png`](capturas-material/escritorio-04-material-lista-otro-cliente.png) | [`celular-04-material-lista-otro-cliente.png`](capturas-material/celular-04-material-lista-otro-cliente.png) |
| Material · editor de fotos | [`escritorio-05-material-editor-foto.png`](capturas-material/escritorio-05-material-editor-foto.png) | [`celular-05-material-editor-foto.png`](capturas-material/celular-05-material-editor-foto.png) |
| Material · versión registrada | [`escritorio-06-material-registrado.png`](capturas-material/escritorio-06-material-registrado.png) | [`celular-06-material-registrado.png`](capturas-material/celular-06-material-registrado.png) |
| Material · entrega con enlace firmado | [`escritorio-07-material-entrega.png`](capturas-material/escritorio-07-material-entrega.png) | [`celular-07-material-entrega.png`](capturas-material/celular-07-material-entrega.png) |
| Material · registro de auditoría | [`escritorio-08-material-auditoria.png`](capturas-material/escritorio-08-material-auditoria.png) | [`celular-08-material-auditoria.png`](capturas-material/celular-08-material-auditoria.png) |

Las capturas de ejemplo (carpetas, archivos y enlace de entrega) son **material
ficticio**: no hay credenciales de Google en este entorno. La interfaz lo dice
en pantalla con «MODO EJEMPLO».
