# QA verificable · editores y reestructuración · 2026-11-22

## Editores profesionales

La conexión original no se rehízo desde cero: se recuperó en el historial del repo en `b02d630` y quedó integrada en la rama actual mediante los mismos módulos `src/components/estudio/photo-studio.tsx` y `src/components/estudio/video-studio.tsx`.

| Función | Foto | Video | Evidencia de código / clic |
|---|---:|---:|---|
| Ruta dentro del Hub | ✅ | ✅ | `/editar/foto` y `/editar/video` en `workspace-shell.tsx` |
| Carga de archivo / demo | ✅ | ✅ | `PhotoStudio` / `VideoStudio` |
| Edición no destructiva en navegador | ✅ | ✅ | modelos y operaciones en `src/lib/estudio/` |
| Capas, recorte, ajustes y filtros | ✅ | — | `photo-studio.tsx` |
| Pistas, cortes, velocidad y transiciones | — | ✅ | `video-studio.tsx`, `timeline.tsx` |
| Texto y audio | — | ✅ | `video-studio.tsx` |
| Exportación | PNG/JPG | WebM/MP4 | `compose.ts`, `export.ts`, `render.ts` |
| No salir del Hub | ✅ | ✅ | páginas Next renderizan el componente dentro del shell |

Recorrido verificable en el head del PR (demo local, 2026-11-23): las cuatro rutas respondieron HTTP 200; clics reales Hub → Material, Hub → `EDITAR FOTO`, Hub → `EDITAR VIDEO`, botón `Recortar` y botón `Cortar` fueron aceptados. Esto prueba navegación y apertura de controles, no una exportación completa con archivo real.

| Control | Head actual | Evidencia | Estado |
|---|---:|---|---|
| Abrir editor foto desde Hub | ✅ | captura `visual-review-2026-11-23/editor-foto.png` + clic navegable | Verificado |
| Abrir editor video desde Hub | ✅ | captura `visual-review-2026-11-23/editor-video.png` + clic navegable | Verificado |
| Carga de archivo real | — | no se subió un archivo durante esta corrida demo | Pendiente |
| Recorte / corte | ✅ apertura | clic real en `Recortar` / `Cortar`; no se guardó un archivo | Parcial |
| Exportación | — | botones existen en el código y las capturas; no se descargó binario | Pendiente |

## Reestructuración

- **Producción:** la cola usa `ProductionPipeline` y muestra solo piezas en producción; el acceso queda directo en el grupo Trabajo.
- **Aprobaciones:** la cola muestra el estado, la antigüedad y ahora también `RESPONSABLE` de la decisión (cliente/equipo según la fase).
- **Métricas:** cada ficha permite guardar URL publicada, alcance, interacciones, conversiones y nota/fuente. `src/app/[projectSlug]/metricas/page.tsx` ahora renderiza una tarjeta por publicación publicada, con enlace, los tres resultados y la nota/fuente; los vacíos se muestran como `—` y no como cero.
- **Clientes:** métricas no se entregan a visitantes anónimos; la ruta exige una fila de acceso del proyecto (o modo demo). Un cliente autenticado ve únicamente el proyecto autorizado.
- **Márgenes/instalación:** `InstalarApp` es el único componente de instalación; el pie reserva espacio móvil y los controles flotantes no comparten esquina con los enlaces.

## Evidencia accesible y alcance de la comparación

La evidencia visual versionada está en `visual-review/`:

- `foto.png` y `video.png`: vista de los dos editores dentro del Hub.
- `e2e/celular-05-editor-foto.png` y `e2e/celular-06-editor-video.png`: recorrido móvil.
- `e2e/escritorio-01-portada.png` a `e2e/escritorio-04-tablero.png`: recorrido de escritorio versionado hasta el tablero.
- Las capturas específicas de editor disponibles son `foto.png`, `video.png` y `e2e/celular-05-editor-foto.png` / `e2e/celular-06-editor-video.png`; las capturas de escritorio 09–11 todavía no están versionadas.

`b02d630` es el commit original recuperado y el head actual conserva los mismos componentes de estudio; la comparación de código se verificó con `git diff b02d630..HEAD -- src/components/estudio src/lib/estudio`. No se declara una comparación visual lado a lado contra `b02d630`: el worktree histórico no pudo levantar el servidor en esta corrida por dependencias aisladas/Turbopack, y el repo no conserva una segunda URL autenticada de Craft Everything. Por tanto, “original recuperado” y “servicio externo Craft” no se tratan como equivalentes.

## Comprobaciones

La corrección de Métricas quedó en el mismo PR: `src/app/[projectSlug]/metricas/page.tsx` y los tipos de modo demo en `src/lib/demo-data.ts` / `src/lib/demo-store.ts`. El guard de acceso se evalúa antes de consultar las ideas: sin acceso al proyecto la ruta devuelve el tablero privado y no expone resultados.

```text
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run test:e2e -- e2e/recorrido-hub.spec.ts # requiere HUB_SECRET/entorno estable
```

No se hizo merge ni despliegue. La matriz de funciones externas de Craft Everything queda limitada a lo que el repositorio conserva: no se dispone de una segunda URL autenticada de Craft para comparar pixel a pixel fuera del Hub.

En la actualización 2026-11-23: `npm run typecheck` OK, `npm run lint` OK, `npm test -- --run` pasó con `78` archivos y `711` pruebas, y `npm run build` OK (con avisos de variables Supabase ausentes en demo). El E2E completo no se declara verde: requiere `HUB_SECRET` y sesión estable. La ruta protegida de Métricas está verificada por código y pruebas de acceso, pero no se probó con dos cuentas reales en navegador.

## Responsive, márgenes e instalación

| Requisito | Estado | Motivo |
|---|---|---|
| Escritorio | Verificado | capturas `visual-review/` y build de todas las rutas |
| Móvil 360 px sin overflow | Pendiente | existen capturas móviles versionadas, pero esta corrida no pudo completar la medición automatizada de `scrollWidth` |
| Márgenes / pie y controles flotantes | Verificado por código | `globals.css` y `InstalarApp`; no se afirma prueba pixel-perfect externa |
| Un único control de instalación | Verificado por código | búsqueda de `InstalarApp` y documentación del PR; no se afirma un E2E completo |
