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
- **Métricas:** cada ficha permite guardar URL publicada, alcance, interacciones, conversiones y nota/fuente. La pantalla de métricas lee esos datos y deja claro lo que aún no tiene registro.
- **Clientes:** métricas no se entregan a visitantes anónimos; la ruta exige una fila de acceso del proyecto (o modo demo). Un cliente autenticado ve únicamente el proyecto autorizado.
- **Márgenes/instalación:** `InstalarApp` es el único componente de instalación; el pie reserva espacio móvil y los controles flotantes no comparten esquina con los enlaces.

## Comprobaciones

```text
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run test:e2e -- e2e/recorrido-hub.spec.ts
```

No se hizo merge ni despliegue. La matriz de funciones externas de Craft Everything queda limitada a lo que el repositorio conserva: no se dispone de una segunda URL autenticada de Craft para comparar pixel a pixel fuera del Hub.
