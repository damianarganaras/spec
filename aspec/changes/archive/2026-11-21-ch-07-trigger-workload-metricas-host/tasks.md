# Tasks: Trigger CH-07 — workload y métricas de host

- [x] T1 — Verificar fuentes del trigger contra el repo (read-only): leer backlog CH-07, V2 §CH-07 + §8A.2, baseline §8 y `src/cli/index.js` (cache crudo, `timeCreated/Updated`, sin arquetipo/errors/host).
- [x] T2 — Fijar formato del informe pre-A/B: workload (tareas cerradas + arquetipo manual + criterio calidad binario), tabla de métricas con estado `supported`/`not-supported` y fuente por campo (`stats --json`, `stats failures --json`, instrumento host o `not-supported`).
- [x] T3 — Correr verificación read-only en el commit vigente: `node src/cli/index.js stats --json --limit 500`, `stats failures --json`, `discovery --check`, `doctor`; registrar qué campos existen y cuáles quedan `not-supported` (wall, errors de sesión, semántica cache, CPU/RAM/I-O).
- [x] T4 — Declarar veredicto del gate: `NO-GO` (2026-11-21: sin workload etiquetado; stats sin arquetipo/wall/errors; cache crudo sin semántica; host sin CPU/RAM/I-O). Sin implementar A/B.
- [x] T5 — Cierre spec: sin `specs/` (este change no altera comportamiento especificado), archivos verificados en disco e hito reportado por orca.
