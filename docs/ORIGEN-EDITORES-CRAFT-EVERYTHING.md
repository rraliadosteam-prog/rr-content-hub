# Origen verificable de los editores de foto y video

## Veredicto

El Hub usa los editores de estudio recuperados en el historial de este
repositorio en el commit [`b02d630`](https://github.com/rraliadosteam-prog/rr-content-hub/commit/b02d630).
No son enlaces externos ni iframes: las dos rutas renderizan componentes React
locales dentro del Content Hub.

Esto identifica de forma verificable el código conservado en el repositorio,
pero no prueba por sí solo que sea idéntico al servicio RR Imagen de
`http://127.0.0.1:35329/`: ese equipo no estuvo accesible durante esta corrida
y no existe en el repo una captura/hash del bundle externo para comparar.

## Evidencia de origen

El commit `b02d630` agrega simultáneamente el motor de foto, el motor de video,
los modelos, renderizadores y exportadores:

| Editor | Componente actual | Motor recuperado en `b02d630` | Ruta interna |
|---|---|---|---|
| Foto | `src/components/estudio/photo-studio.tsx` | `src/lib/estudio/foto/{model,imageops,compose}.ts` | `/{cliente}/editar/foto` |
| Video | `src/components/estudio/video-studio.tsx` | `src/lib/estudio/video/{model,render,export}.ts` | `/{cliente}/editar/video` |

La integración de rutas está en:

- `src/app/[projectSlug]/editar/foto/page.tsx`
- `src/app/[projectSlug]/editar/video/page.tsx`
- `src/components/workspace-shell.tsx`

La nota de decisión de producto está en
[`docs/NOTA_spec_v2_editores.md`](./NOTA_spec_v2_editores.md): los editores
viven dentro del Hub y no redirigen a otro servicio.

## Funciones preservadas

| Función | Foto | Video | Evidencia de implementación |
|---|---:|---:|---|
| Carga local de archivo | Sí | Sí | `input[type=file]` y zona de arrastre en ambos componentes |
| Edición principal | Capas, texto, ajustes, filtros, recorte | Pistas, cortes, velocidad, transiciones, texto y audio | `photo-studio.tsx`, `video-studio.tsx`, `timeline.tsx` |
| Exportación local | PNG, JPG, WebP | WebM y MP4 (H.264 cuando el navegador lo soporta) | `foto/compose.ts`, `video/export.ts`, `video/render.ts` |
| Salida del Hub | Descarga directa en navegador | Descarga directa en navegador | `downloadBlob()`; no hay `window.open` ni enlace externo |

## Comparación externa y límites

El repositorio permite comparar el código recuperado (`b02d630`) con el head
actual, pero no contiene una segunda URL autenticada de Craft Everything ni
los archivos originales externos. Por eso este documento **no** afirma una
comparación pixel a pixel contra el servicio externo. La afirmación verificable
es que el head conserva los mismos módulos de estudio recuperados y los expone
como rutas internas.

La prueba de carga/exportación con archivos reales debe ejecutarse en un
navegador con los codecs disponibles; la suite de navegación incluida prueba
las rutas, los controles y el diálogo de exportación, pero no sustituye esa
prueba binaria.

