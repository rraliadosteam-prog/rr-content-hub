# Nota de corrección de la spec v2 — los editores de foto y video

**Fecha:** 9 de noviembre de 2026.
**Rama:** `cursor/flow-fotos-video-ia-58f6` · PR #1.
**Alcance:** corrige una decisión equivocada de `docs/06_spec_v2.md` (§2, decisión 2 y §6).

## Qué dice la spec v2 (mal)

La spec v2 affirmed que «los editores pro de foto y video quedan fuera del Hub por ahora»
y que la integración con Craft era una «propuesta de contrato futuro que deberá aprobarse
de nuevo». Con esa frase, el Hub se quedaba sin editor: quien tuviera que retocar una
foto o montar un video tenía que salirse del Hub, abrir otra herramienta y volver.

## La decisión real de Rosas

> **La spec v2 dijo por error que los editores pro quedaban fuera del Hub. Decisión real de
> Rosas: los editors de foto y video van DENTRO del Content Hub; nadie tiene que salir del
> hub para editar.**

## Qué significa en el producto

- Los editores de foto y de video son **secciones del Content Hub**, no enlaces a otro
  servicio: `Material`, `Editar foto` y `Editar video` viven dentro del proyecto.
- Editar **no es salir**: quien edita no cambia de herramienta, no pierde el contexto de la
  pieza y no necesita una cuenta de terceros.
- Todo el trabajo ocurre **en el navegador de la persona**: los archivos no se suben a
  ningún servicio externo y el material original nunca se toca.
- El video se exporta en **WebM y en MP4 (H.264)**, y el recorte de fondo es una
  **heurística local** («Quitar fondo (básico)») mientras no exista IA real detrás.
- El material que se edita sigue el mismo camino que el material que no se edita:
  registro de auditoría, versiones y entrega con enlace que vence.

## Qué NO cambia

- Flow sigue siendo **un único botón externo**, sin cuenta preseleccionada.
- La puerta sigue siendo la de **código por cliente** y la cookie firmada que ya existen.
- La separación entre **decisiones internas** y **aprobación del cliente** sigue igual.
- No hay migraciones, no hay escrituras en el Supabase real y no hay secretos nuevos.

## Dónde se aplica

| Sección | Ruta | Qué hace |
|---|---|---|
| Material | `/{cliente}/material` | Carpeta de Drive, registro, versiones y entrega. |
| Editar foto | `/{cliente}/editar/foto` | Capas, recorte, ajustes, filtros, texto, «Quitar fondo (básico)» y export. |
| Editar video | `/{cliente}/editar/video` | Pistas multipista, cortes, velocidad, transiciones, texto, audio y export. |

Esta nota manda sobre el texto de la spec v2 en todo lo que las contradiga. La spec v2
sigue siendo válida en todo lo demás.
