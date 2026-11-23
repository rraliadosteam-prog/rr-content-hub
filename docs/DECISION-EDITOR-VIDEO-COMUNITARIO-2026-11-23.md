# Evaluación de editor de video comunitario · 2026-11-23

## Decisión para el PR #3

No se reemplaza el editor actual en este PR. El Hub ya tiene un editor de
video local, con ruta interna, timeline, cortes, velocidad, transiciones,
texto, audio y exportación. Cambiarlo por un proyecto externo exigiría una
auditoría de compatibilidad, dependencia de APIs de navegador, adaptación de
estado/proyecto, accesibilidad, marca RR y pruebas binarias; hacerlo aquí sin
verificar el editor de Deadkiss aumentaría el riesgo y no demostraría que se
conservan las funciones de Craft Everything.

## Opciones comunitarias verificadas

| Proyecto | Evidencia pública | Licencia declarada | Encaje | Riesgo actual |
|---|---|---|---|---|
| [OpenCut](https://github.com/opencutvideo/Opencut) | Editor web local; timeline, trim e import/export en navegador | MIT, según su README | Mejor candidato para un spike separado | Proyecto joven; requiere validar integración React/WASM, memoria y codecs |
| [FreeCut](https://github.com/walterlow/freecut) | Editor multipista con keyframes y exportación WebCodecs/WebGPU | MIT, según el repositorio | Candidato técnico para Chromium moderno | Sin release estable; dependencia fuerte de WebGPU/WebCodecs |
| [OpenReel Video](https://github.com/heychintan/openreel) | Editor browser-based React/TypeScript y procesamiento local | MIT, según el repositorio | Interesante para comparación funcional | Debe auditarse procedencia de dependencias y madurez antes de incorporar |

La licencia indicada arriba es la del proyecto en su repositorio al momento de
la revisión; antes de incorporar código hay que fijar un commit, revisar el
archivo `LICENSE`, avisos de terceros y la licencia efectiva de cada dependencia
multimedia.

## Comparación contra lo que hoy exige el Hub

| Requisito | Editor actual del Hub | Candidato comunitario | Estado |
|---|---:|---:|---|
| Vive dentro del Hub, sin redirección | Sí | Posible, no probado | Pendiente |
| Pistas y cortes | Sí | Sí declarado en OpenCut/FreeCut | Pendiente de clic real |
| Velocidad, transiciones, texto y audio | Sí | Parcial según proyecto | Pendiente de matriz real |
| Exportación binaria WebM/MP4 | Implementada | Depende de codec/API | Pendiente con archivo real |
| Estado y permisos del proyecto RR | Integrado | No compatible sin adaptador | Pendiente de diseño |
| 360 px y escritorio | Evidencia parcial | No probado | Pendiente |

## Siguiente paso técnico acotado

Abrir un spike separado con OpenCut y FreeCut, fijando commits concretos y
probando: importar un MP4 corto, recortar, añadir texto/audio, exportar un
binario descargable, reabrir el proyecto, ejecutar a 360 px y medir bundle y
memoria. Solo si supera al editor actual sin romper el modelo de permisos se
prepara una integración aparte. No se incorporó código de terceros en este PR.

## Bloqueos de esta corrida

- Deadkiss no está compartido con este encargo; no pude abrir
  `http://127.0.0.1:35329/`, tomar captura ni calcular hash del RR Imagen real.
- No se pudo ejecutar la prueba con archivo real ni verificar exportación binaria
  desde el navegador montado.
- No hay evidencia para afirmar que OpenCut, FreeCut u OpenReel sean el editor
  de video que Rosas tenía antes; son alternativas comunitarias evaluadas.

