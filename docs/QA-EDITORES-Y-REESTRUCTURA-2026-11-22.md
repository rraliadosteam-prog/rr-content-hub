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

Recorrido real ejecutado en local: abrir Hub → `EDITAR FOTO` → probar carga/ajuste/exportación → volver al menú → `EDITAR VIDEO` → añadir clip → cortes/controles → exportación. Las capturas de la corrida anterior están en `visual-review/foto.png` y `visual-review/video.png`; la prueba automatizada de rutas está en `e2e/recorrido-hub.spec.ts`.

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

La comparación lado a lado se puede reproducir sin una cuenta externa: `b02d630` es el commit que recupera los módulos profesionales de Craft Everything y la rama de integración usa esos mismos archivos, no una implementación alternativa. La matriz de arriba compara cada capacidad contra el código y el recorrido real. No se afirma una comparación pixel a pixel con Craft Everything porque el repo no conserva una segunda URL autenticada del editor original.

## Comprobaciones

La corrección de Métricas quedó en el mismo PR: `src/app/[projectSlug]/metricas/page.tsx` y los tipos de modo demo en `src/lib/demo-data.ts` / `src/lib/demo-store.ts`. El guard de acceso se evalúa antes de consultar las ideas: sin acceso al proyecto la ruta devuelve el tablero privado y no expone resultados.

```text
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run test:e2e -- e2e/recorrido-hub.spec.ts
```

No se hizo merge ni despliegue. La matriz de funciones externas de Craft Everything queda limitada a lo que el repositorio conserva: no se dispone de una segunda URL autenticada de Craft para comparar pixel a pixel fuera del Hub.

En esta actualización, la suite enfocada de editores/acceso pasó: `3` archivos y `23` pruebas (`src/lib/estudio/estudio.test.ts`, `src/lib/material-ui.test.ts`, `src/lib/demo-mode-production.test.ts`). El intento global y `typecheck` quedaron sin salida dentro del entorno de trabajo y se detuvieron por tiempo; no se reportan como aprobados. El E2E completo requiere `HUB_SECRET`; con una clave efímera llegó a ejecutar la puerta y varias pantallas, pero el proceso de desarrollo se cerró antes de terminar el recorrido, por lo que queda pendiente de un entorno estable. El spec reproducible es `e2e/recorrido-hub.spec.ts`.
