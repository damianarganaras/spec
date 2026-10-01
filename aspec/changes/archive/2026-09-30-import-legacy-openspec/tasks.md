# Tasks: Import de proyecto OpenSpec pre-existente en init (brecha externa)

## Fase 1 — Detección externa (reutilizando helper existente)

- [x] Extender `detectLegacyOpenSpec` para distinguir layout OpenSpec externo (specs/changes con archivos, `AGENTS.md` OpenSpec) sin tocar la rama legacy existente.
- [x] Agregar prompt interactivo (Sí/No/ver detalle, default No) y no-op silencioso ante `openspec/` vacío.
- [x] Tests con fixture externo: detección positiva y no-falso-positivo.

## Fase 2 — Importación semilla + cableado

- [x] Implementar importación (specs archivadas + changes activos + `AGENTS.md` con aviso, sin pisar `aspec/` real) + marcador.
- [x] Cablear detección en `install --project` antes de `scaffoldAspec`.
- [x] Permitir `upgrade` migratorio sin `.ancletorc` ante `openspec/` detectado.
- [x] Tests: import conserva backup + marcador; `aspec/` real no se pisa; `install --project` detecta; `upgrade` sin rc migra.

## Fase 3 — Cierre

- [x] Suite `node --test` en verde sin regresión en tests del change archivado.
- [x] Actualizar BACKLOG (cerrar brechas F e `install --project`).
